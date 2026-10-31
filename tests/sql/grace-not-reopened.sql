-- Regression test for #242: a stopped snapshot applied over a row that is
-- already paused/cancelled keeps the carência the row recorded, even after it
-- lapsed, so re-applying the same snapshot never reopens it and the cron drops
-- the negócio to Free.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/grace-not-reopened.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function pg_temp.new_cancelled(p_tag text, p_grace timestamptz)
returns table (business_id uuid, subscription_id uuid)
language plpgsql
as $$
declare
  v_owner uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
  v_sub uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'grace-' || p_tag || '@example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono ' || p_tag);
  insert into public.businesses (id, owner_id, name, slug, phone, timezone)
  values (v_business, v_owner, 'Negocio ' || p_tag, 'grace-' || p_tag, '11988887777', 'America/Sao_Paulo');
  insert into public.subscriptions (business_id, mp_preapproval_id, status, plan)
  values (v_business, 'mp-grace-' || p_tag, 'pending', 'pro')
  returning id into v_sub;
  update public.businesses set current_subscription_id = v_sub where id = v_business;
  perform public.apply_subscription_snapshot(
    v_business, v_sub, 'mp-grace-' || p_tag, 'authorized',
    now(), now() + interval '30 days', null, false, null, timestamptz '2026-09-01 10:00Z'
  );
  perform public.apply_subscription_snapshot(
    v_business, v_sub, 'mp-grace-' || p_tag, 'cancelled',
    null, null, p_grace, false, null, timestamptz '2026-09-20 10:00Z'
  );
  return query select v_business, v_sub;
end;
$$;

do $$
declare
  v record;
  r record;
  v_lapsed timestamptz := now() - interval '1 minute';
  v_plan public.business_plan;
  v_grace timestamptz;
begin
  -- The same cancelled snapshot (same version) re-applied with a fresh grace,
  -- as a re-read after the carência lapsed would send: applied, but the lapsed
  -- grace stays.
  select * into v from pg_temp.new_cancelled('replayed', v_lapsed);
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-grace-replayed', 'cancelled',
    null, null, now() + interval '7 days', false, null, timestamptz '2026-09-20 10:00Z'
  );
  if not r.applied or r.effective_grace_period_end <> v_lapsed then
    raise exception 'replayed cancelled: expected applied keeping the lapsed grace %, got applied=% grace=%',
      v_lapsed, r.applied, r.effective_grace_period_end;
  end if;

  -- A paused after the cancellation does not reopen it either.
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-grace-replayed', 'paused',
    null, null, now() + interval '7 days', false, null, timestamptz '2026-09-21 10:00Z'
  );
  select s.grace_period_end into v_grace from public.subscriptions s where s.id = v.subscription_id;
  if v_grace <> v_lapsed then
    raise exception 'paused over cancelled: expected grace %, got %', v_lapsed, v_grace;
  end if;

  -- The cron drops the negócio to Free once the recorded grace has passed.
  perform public.downgrade_expired_subscriptions();
  select b.plan into v_plan from public.businesses b where b.id = v.business_id;
  if v_plan <> 'free' then
    raise exception 'downgrade: expected free after the lapsed grace, got %', v_plan;
  end if;

  -- A stopped row without a recorded grace still takes the one passed in.
  select * into v from pg_temp.new_cancelled('no-grace', null);
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-grace-no-grace', 'cancelled',
    null, null, now() + interval '7 days', false, null, timestamptz '2026-09-20 10:00Z'
  );
  if r.effective_grace_period_end is null or r.effective_grace_period_end <= now() + interval '6 days' then
    raise exception 'stopped row without grace: expected a new grace, got %', r.effective_grace_period_end;
  end if;

  -- The stop itself (authorized -> cancelled) still opens the grace.
  select * into v from pg_temp.new_cancelled('fresh', now() + interval '7 days');
  select s.grace_period_end into v_grace from public.subscriptions s where s.id = v.subscription_id;
  if v_grace <= now() + interval '6 days' then
    raise exception 'first stop: expected a 7-day grace, got %', v_grace;
  end if;
end;
$$;

rollback;

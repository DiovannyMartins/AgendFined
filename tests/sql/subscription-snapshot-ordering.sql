-- Regression test for the ordering fence of apply_subscription_snapshot(): a
-- snapshot whose provider last_modified is older than the stored one is ignored
-- (no write, no error), and the result reports the status the row had before.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/subscription-snapshot-ordering.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function pg_temp.new_authorized(p_tag text)
returns table (business_id uuid, subscription_id uuid)
language plpgsql
as $$
declare
  v_owner uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
  v_sub uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'ordering-' || p_tag || '@example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono ' || p_tag);
  insert into public.businesses (id, owner_id, name, slug, phone, timezone)
  values (v_business, v_owner, 'Negocio ' || p_tag, 'ordering-' || p_tag, '11988887777', 'America/Sao_Paulo');
  insert into public.subscriptions (business_id, mp_preapproval_id, status, plan)
  values (v_business, 'mp-ordering-' || p_tag, 'pending', 'pro')
  returning id into v_sub;
  update public.businesses set current_subscription_id = v_sub where id = v_business;
  perform public.apply_subscription_snapshot(
    v_business, v_sub, 'mp-ordering-' || p_tag, 'authorized',
    now(), now() + interval '30 days', null, false, null, timestamptz '2026-10-01 10:00Z'
  );
  return query select v_business, v_sub;
end;
$$;

do $$
declare
  v record;
  r record;
  v_row public.subscriptions;
  v_grace timestamptz := now() + interval '7 days';
begin
  -- A newer `paused` is applied and opens the carência; it reports the row was
  -- authorized before it.
  select * into v from pg_temp.new_authorized('newer');
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-ordering-newer', 'paused',
    null, null, v_grace, false, null, timestamptz '2026-10-02 10:00Z'
  );
  if not r.applied or r.previous_status <> 'authorized' or r.subscription_status <> 'paused' then
    raise exception 'newer paused: expected applied from authorized, got applied=% previous=% status=%',
      r.applied, r.previous_status, r.subscription_status;
  end if;

  -- The same `paused` delivered again: applied (same version), previous paused,
  -- so the dono is not told twice.
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-ordering-newer', 'paused',
    null, null, v_grace, false, null, timestamptz '2026-10-02 10:00Z'
  );
  if not r.applied or r.previous_status <> 'paused' then
    raise exception 'repeated paused: expected applied from paused, got applied=% previous=%',
      r.applied, r.previous_status;
  end if;

  -- An `authorized` read before the pause arrives late: ignored, the carência
  -- stays and the result describes the stored state.
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-ordering-newer', 'authorized',
    now(), now() + interval '30 days', null, false, null, timestamptz '2026-10-01 10:00Z'
  );
  select * into v_row from public.subscriptions where id = v.subscription_id;
  if r.applied or r.subscription_status <> 'paused' or r.effective_grace_period_end is distinct from v_grace then
    raise exception 'stale authorized: expected ignored, got applied=% status=% grace=%',
      r.applied, r.subscription_status, r.effective_grace_period_end;
  end if;
  if v_row.status <> 'paused' or v_row.grace_period_end is distinct from v_grace
     or v_row.provider_modified_at <> timestamptz '2026-10-02 10:00Z' then
    raise exception 'stale authorized: row changed to status=% grace=% version=%',
      v_row.status, v_row.grace_period_end, v_row.provider_modified_at;
  end if;

  -- A stale snapshot never repoints the negócio, even with a matching CAS.
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-ordering-newer', 'authorized',
    null, null, null, true, v.subscription_id, timestamptz '2026-09-30 10:00Z'
  );
  if r.applied then
    raise exception 'stale make_current: expected ignored';
  end if;

  -- A snapshot without a version keeps the previous behaviour and leaves the
  -- stored version in place.
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-ordering-newer', 'authorized',
    now(), now() + interval '30 days', null
  );
  select * into v_row from public.subscriptions where id = v.subscription_id;
  if not r.applied or v_row.status <> 'authorized' or v_row.grace_period_end is not null
     or v_row.provider_modified_at <> timestamptz '2026-10-02 10:00Z' then
    raise exception 'unversioned: expected applied keeping the version, got applied=% status=% version=%',
      r.applied, v_row.status, v_row.provider_modified_at;
  end if;

  -- A row with no stored version accepts any snapshot and records its version.
  select * into v from pg_temp.new_authorized('legacy');
  update public.subscriptions set provider_modified_at = null where id = v.subscription_id;
  select * into r from public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-ordering-legacy', 'cancelled',
    null, null, v_grace, false, null, timestamptz '2020-01-01 00:00Z'
  );
  select * into v_row from public.subscriptions where id = v.subscription_id;
  if not r.applied or v_row.status <> 'cancelled' or v_row.provider_modified_at <> timestamptz '2020-01-01 00:00Z' then
    raise exception 'legacy row: expected applied and versioned, got applied=% status=% version=%',
      r.applied, v_row.status, v_row.provider_modified_at;
  end if;
end;
$$;

rollback;

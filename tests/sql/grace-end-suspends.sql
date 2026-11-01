-- #261, fase 4 (ADR 0013, ADR 0008): the end of the carência suspends the
-- negócio by itself. business_has_access() decides on
-- businesses.current_subscription_id (#228), not on the newest subscriptions
-- row, and no cron or plan column is involved any more.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/grace-end-suspends.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A negócio whose teste grátis already ended: only the assinatura counts.
create function pg_temp.new_business(p_tag text)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'grace-end-' || p_tag || '@example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono ' || p_tag);
  insert into public.businesses (id, owner_id, name, slug, phone, timezone, trial_ends_at)
  values (v_business, v_owner, 'Negocio ' || p_tag, 'grace-end-261-' || p_tag, '11988887777', 'America/Sao_Paulo',
    now() - interval '1 day');
  return v_business;
end;
$$;

create function pg_temp.new_subscription(
  p_business uuid,
  p_tag text,
  p_age interval
)
returns uuid
language sql
as $$
  insert into public.subscriptions (business_id, mp_preapproval_id, status, created_at)
  values (p_business, 'mp-261-' || p_tag, 'pending', now() - p_age)
  returning id;
$$;

-- A paid checkout B, superseded by a newer retry checkout C, is made current
-- by the webhook (handleWebhook makeCurrent).
create function pg_temp.paid_superseded_checkout(p_tag text)
returns table (business_id uuid, b_id uuid, c_id uuid)
language plpgsql
as $$
declare
  v_business uuid := pg_temp.new_business(p_tag);
  v_b uuid := pg_temp.new_subscription(v_business, p_tag || '-b', interval '3 hours');
  v_c uuid := pg_temp.new_subscription(v_business, p_tag || '-c', interval '2 hours');
begin
  update public.businesses set current_subscription_id = v_c where id = v_business;
  perform public.apply_subscription_snapshot(
    v_business, v_b, 'mp-261-' || p_tag || '-b', 'authorized',
    now(), now() + interval '30 days', null, true, v_c
  );
  return query select v_business, v_b, v_c;
end;
$$;

create function pg_temp.assert_access(p_business uuid, p_expected boolean, p_case text)
returns void
language plpgsql
as $$
begin
  if public.business_has_access(p_business) is distinct from p_expected then
    raise exception '%: expected access %, got %', p_case, p_expected, not p_expected;
  end if;
end;
$$;

do $$
declare
  v record;
  v_business uuid;
  v_sub uuid;
begin
  -- (a1) Paid current, newer replacement C still pending.
  select * into v from pg_temp.paid_superseded_checkout('a1');
  perform pg_temp.assert_access(v.business_id, true, 'a1 paid current, newer replacement pending');

  -- (a2) Paid current, replacement C cancelled with no grace (closedUnpaid).
  select * into v from pg_temp.paid_superseded_checkout('a2');
  perform public.apply_subscription_snapshot(
    v.business_id, v.c_id, 'mp-261-a2-c', 'cancelled', null, null, null, false, null
  );
  perform pg_temp.assert_access(v.business_id, true, 'a2 paid current, newer replacement closed unpaid');

  -- (b) Current subscription cancelled and its grace already lapsed: suspended
  -- right away, without a cron.
  select * into v from pg_temp.paid_superseded_checkout('b');
  update public.subscriptions
  set status = 'cancelled', grace_period_end = now() - interval '1 second'
  where id = v.b_id;
  perform pg_temp.assert_access(v.business_id, false, 'b current cancelled, grace lapsed');

  -- (c) Current subscription cancelled with the grace still active.
  select * into v from pg_temp.paid_superseded_checkout('c');
  update public.subscriptions
  set status = 'cancelled', grace_period_end = now() + interval '1 day'
  where id = v.b_id;
  perform pg_temp.assert_access(v.business_id, true, 'c current cancelled, grace active');

  -- (d) Legacy business without current_subscription_id: newest row lapsed.
  v_business := pg_temp.new_business('d');
  v_sub := pg_temp.new_subscription(v_business, 'd', interval '1 hour');
  update public.subscriptions
  set status = 'cancelled', grace_period_end = now() - interval '1 day'
  where id = v_sub;
  perform pg_temp.assert_access(v_business, false, 'd legacy, newest row lapsed');

  -- (e) Legacy business without current_subscription_id: newest row paid.
  v_business := pg_temp.new_business('e');
  v_sub := pg_temp.new_subscription(v_business, 'e', interval '1 hour');
  update public.subscriptions set status = 'authorized' where id = v_sub;
  perform pg_temp.assert_access(v_business, true, 'e legacy, newest row authorized');

  -- (f) Subscribed during the teste (authorized, nothing paid until start_date):
  -- the access continues after the teste ends.
  v_business := pg_temp.new_business('f');
  v_sub := pg_temp.new_subscription(v_business, 'f', interval '1 hour');
  update public.businesses set current_subscription_id = v_sub where id = v_business;
  perform public.apply_subscription_snapshot(
    v_business, v_sub, 'mp-261-f', 'authorized', now() + interval '1 hour', now() + interval '1 hour', null, false, null
  );
  perform pg_temp.assert_access(v_business, true, 'f authorized before the first charge, teste over');

  -- The plano Grátis left no trace in the database.
  if to_regtype('public.business_plan') is not null then
    raise exception 'business_plan must not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('businesses', 'subscriptions') and column_name = 'plan'
  ) then
    raise exception 'businesses.plan / subscriptions.plan must not exist';
  end if;
  if to_regprocedure('public.downgrade_expired_subscriptions()') is not null
     or to_regprocedure('public.protect_business_plan()') is not null then
    raise exception 'downgrade_expired_subscriptions / protect_business_plan must not exist';
  end if;
  if exists (select 1 from cron.job where jobname = 'subscription-grace-downgrade') then
    raise exception 'the subscription-grace-downgrade cron must not be scheduled';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~ '\mbusiness_plan\M|\m(b|businesses)\.plan\M|\mset plan\M'
  ) then
    raise exception 'a function still reads or writes the plan';
  end if;
end;
$$;

rollback;
select 'grace end suspends regression passed; transaction rolled back' as result;

-- Regression test for #228: downgrade_expired_subscriptions() decides on
-- businesses.current_subscription_id, not on the newest subscriptions row.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/downgrade-current-subscription.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function pg_temp.new_business(p_tag text)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'downgrade-' || p_tag || '@example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono ' || p_tag);
  insert into public.businesses (id, owner_id, name, slug, phone, timezone)
  values (v_business, v_owner, 'Negocio ' || p_tag, 'downgrade-228-' || p_tag, '11988887777', 'America/Sao_Paulo');
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
  insert into public.subscriptions (business_id, mp_preapproval_id, status, plan, created_at)
  values (p_business, 'mp-228-' || p_tag, 'pending', 'pro', now() - p_age)
  returning id;
$$;

-- A paid checkout B, superseded by a newer retry checkout C, is made current
-- by the webhook (handleWebhook makeCurrent) and the business becomes pro.
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
    v_business, v_b, 'mp-228-' || p_tag || '-b', 'authorized',
    now(), now() + interval '30 days', null, true, v_c
  );
  return query select v_business, v_b, v_c;
end;
$$;

create function pg_temp.assert_plan(p_business uuid, p_expected public.business_plan, p_case text)
returns void
language plpgsql
as $$
declare
  v_plan public.business_plan := (select plan from public.businesses where id = p_business);
begin
  if v_plan is distinct from p_expected then
    raise exception '%: expected plan %, got %', p_case, p_expected, v_plan;
  end if;
end;
$$;

do $$
declare
  v record;
  v_pending uuid;
  v_closed uuid;
  v_lapsed uuid;
  v_grace uuid;
  v_legacy_lapsed uuid;
  v_legacy_paid uuid;
  v_sub uuid;
begin
  -- (a1) Replacement C still pending (its cancel notification not processed).
  select * into v from pg_temp.paid_superseded_checkout('a1');
  v_pending := v.business_id;
  perform pg_temp.assert_plan(v_pending, 'pro', 'a1 setup');

  -- (a2) Replacement C cancelled with no grace (closedUnpaid).
  select * into v from pg_temp.paid_superseded_checkout('a2');
  v_closed := v.business_id;
  perform public.apply_subscription_snapshot(
    v_closed, v.c_id, 'mp-228-a2-c', 'cancelled', null, null, null, false, null
  );
  perform pg_temp.assert_plan(v_closed, 'pro', 'a2 setup');

  -- (b) Current subscription cancelled and its grace already lapsed.
  select * into v from pg_temp.paid_superseded_checkout('b');
  v_lapsed := v.business_id;
  update public.subscriptions
  set status = 'cancelled', grace_period_end = now() - interval '1 day'
  where id = v.b_id;

  -- (c) Current subscription cancelled with the grace still active.
  select * into v from pg_temp.paid_superseded_checkout('c');
  v_grace := v.business_id;
  update public.subscriptions
  set status = 'cancelled', grace_period_end = now() + interval '1 day'
  where id = v.b_id;

  -- (d) Legacy business without current_subscription_id: newest row lapsed.
  v_legacy_lapsed := pg_temp.new_business('d');
  v_sub := pg_temp.new_subscription(v_legacy_lapsed, 'd', interval '1 hour');
  update public.subscriptions
  set status = 'cancelled', grace_period_end = now() - interval '1 day'
  where id = v_sub;
  update public.businesses set plan = 'pro' where id = v_legacy_lapsed;

  -- (e) Legacy business without current_subscription_id: newest row paid.
  v_legacy_paid := pg_temp.new_business('e');
  v_sub := pg_temp.new_subscription(v_legacy_paid, 'e', interval '1 hour');
  update public.subscriptions set status = 'authorized' where id = v_sub;
  update public.businesses set plan = 'pro' where id = v_legacy_paid;

  perform public.downgrade_expired_subscriptions();

  perform pg_temp.assert_plan(v_pending, 'pro', 'a1 paid current, newer replacement pending');
  perform pg_temp.assert_plan(v_closed, 'pro', 'a2 paid current, newer replacement closed unpaid');
  perform pg_temp.assert_plan(v_lapsed, 'free', 'b current cancelled, grace lapsed');
  perform pg_temp.assert_plan(v_grace, 'pro', 'c current cancelled, grace active');
  perform pg_temp.assert_plan(v_legacy_lapsed, 'free', 'd legacy, newest row lapsed');
  perform pg_temp.assert_plan(v_legacy_paid, 'pro', 'e legacy, newest row authorized');

  if has_function_privilege('anon', 'public.downgrade_expired_subscriptions()', 'execute')
     or has_function_privilege('authenticated', 'public.downgrade_expired_subscriptions()', 'execute')
     or not has_function_privilege('service_role', 'public.downgrade_expired_subscriptions()', 'execute') then
    raise exception 'downgrade_expired_subscriptions must be service_role only';
  end if;
end;
$$;

rollback;
select 'downgrade current subscription regression passed; transaction rolled back' as result;

-- Regression test for GHSA-53c9-8q53-4x8c: `first_authorized_at` records the
-- first `authorized` write of a subscription and never changes after, so a
-- checkout closed `paused`/`cancelled` before it was paid still reads as never
-- authorized, and an assinatura paused after it was paid still reads as paid.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/subscription-first-authorized-at.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function pg_temp.new_checkout(p_tag text)
returns table (business_id uuid, subscription_id uuid)
language plpgsql
as $$
declare
  v_owner uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
  v_sub uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'first-auth-' || p_tag || '@example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono ' || p_tag);
  insert into public.businesses (id, owner_id, name, slug, phone, timezone)
  values (v_business, v_owner, 'Negocio ' || p_tag, 'first-auth-' || p_tag, '11988887777', 'America/Sao_Paulo');
  insert into public.subscriptions (business_id, mp_preapproval_id, status)
  values (v_business, 'mp-first-auth-' || p_tag, 'pending')
  returning id into v_sub;
  update public.businesses set current_subscription_id = v_sub where id = v_business;
  return query select v_business, v_sub;
end;
$$;

create function pg_temp.first_authorized_at(p_sub uuid)
returns timestamptz
language sql
as $$ select first_authorized_at from public.subscriptions where id = p_sub $$;

do $$
declare
  v record;
  v_first timestamptz;
begin
  -- Closed before it was paid: stays null.
  select * into v from pg_temp.new_checkout('closed');
  perform public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-first-auth-closed', 'paused',
    null, null, null, false, null, timestamptz '2026-09-01 10:00Z'
  );
  if pg_temp.first_authorized_at(v.subscription_id) is not null then
    raise exception 'closed unpaid: expected first_authorized_at null';
  end if;

  -- Paid, then paused: keeps the first authorization.
  select * into v from pg_temp.new_checkout('paid');
  perform public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-first-auth-paid', 'authorized',
    now(), now() + interval '30 days', null, false, null, timestamptz '2026-09-01 10:00Z'
  );
  v_first := pg_temp.first_authorized_at(v.subscription_id);
  if v_first is null then
    raise exception 'authorized: expected first_authorized_at set';
  end if;
  perform public.apply_subscription_snapshot(
    v.business_id, v.subscription_id, 'mp-first-auth-paid', 'paused',
    null, null, now() + interval '7 days', false, null, timestamptz '2026-09-20 10:00Z'
  );
  if pg_temp.first_authorized_at(v.subscription_id) is distinct from v_first then
    raise exception 'paused after paid: expected first_authorized_at kept';
  end if;

  -- A direct write can neither clear nor move it.
  update public.subscriptions set first_authorized_at = null where id = v.subscription_id;
  update public.subscriptions set first_authorized_at = now() + interval '1 day' where id = v.subscription_id;
  if pg_temp.first_authorized_at(v.subscription_id) is distinct from v_first then
    raise exception 'direct write: expected first_authorized_at unchanged';
  end if;

  -- An insert that is not authorized cannot claim one.
  select * into v from pg_temp.new_checkout('forged');
  insert into public.subscriptions (business_id, mp_preapproval_id, status, first_authorized_at)
  values (v.business_id, 'mp-first-auth-forged-2', 'paused', now());
  if (select first_authorized_at from public.subscriptions where mp_preapproval_id = 'mp-first-auth-forged-2') is not null then
    raise exception 'forged insert: expected first_authorized_at null';
  end if;
end;
$$;

rollback;

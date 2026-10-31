-- Regression test for supabase/migrations/20261026010000_mfa_aal_allowed_null_safe.sql:
-- private.mfa_aal_allowed() returns false (never NULL) for a JWT without the
-- aal claim, so the owner RPCs refuse it like the RLS policies do, while the
-- opt-in MFA rules stay as they were (ADR 0009).
-- Since 20261031060000_mfa_verified_by_app.sql (GHSA-vjcg, ADR 0012), an aal2
-- of a dono with a verified factor counts only in a session that confirmed the
-- code through the app (private.mfa_verified_sessions).
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/mfa-aal-gate.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Owner A has a verified factor; owner B has none.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000a0a1', 'mfa-gate-a@example.test'),
  ('00000000-0000-4000-8000-00000000b0b1', 'mfa-gate-b@example.test');
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-00000000a0f1', '00000000-0000-4000-8000-00000000a0a1', 'totp', 'verified', now(), now());
-- Session e1 confirmed the code through the app; e2 straight against Supabase Auth.
insert into auth.sessions (id, user_id, aal, created_at, updated_at) values
  ('00000000-0000-4000-8000-00000000a0e1', '00000000-0000-4000-8000-00000000a0a1', 'aal2', now(), now()),
  ('00000000-0000-4000-8000-00000000a0e2', '00000000-0000-4000-8000-00000000a0a1', 'aal2', now(), now());
insert into private.mfa_verified_sessions (session_id, user_id) values
  ('00000000-0000-4000-8000-00000000a0e1', '00000000-0000-4000-8000-00000000a0a1');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-00000000a0a1', 'Dono A'),
  ('00000000-0000-4000-8000-00000000b0b1', 'Dono B');
insert into public.businesses (id, owner_id, name, slug, phone, timezone, min_notice_minutes, plan) values
  ('00000000-0000-4000-8000-00000000a0b1', '00000000-0000-4000-8000-00000000a0a1', 'Negócio A', 'mfa-gate-negocio-a', '11999990001', 'America/Sao_Paulo', 0, 'pro'),
  ('00000000-0000-4000-8000-00000000b0b2', '00000000-0000-4000-8000-00000000b0b1', 'Negócio B', 'mfa-gate-negocio-b', '11999990002', 'America/Sao_Paulo', 0, 'pro');
insert into public.services (id, business_id, name, duration_minutes) values
  ('00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000a0b1', 'Corte A', 30),
  ('00000000-0000-4000-8000-00000000b0c2', '00000000-0000-4000-8000-00000000b0b2', 'Corte B', 30);

create temporary table mfa_gate_fixture (owner text primary key, booking_id uuid, entry_id uuid, service_id uuid) on commit drop;

do $$
declare
  v_owner record;
  v_booking public.bookings;
  v_entry uuid;
begin
  for v_owner in
    select * from (values
      ('a', '00000000-0000-4000-8000-00000000a0b1'::uuid, '00000000-0000-4000-8000-00000000a0c1'::uuid),
      ('b', '00000000-0000-4000-8000-00000000b0b2'::uuid, '00000000-0000-4000-8000-00000000b0c2'::uuid)
    ) as o(owner, business_id, service_id)
  loop
    v_booking := public.create_booking(
      v_owner.business_id, v_owner.service_id, date_trunc('hour', now()) + interval '3 days',
      'Cliente Teste', '11988887777', encode(sha256(convert_to('booking-' || v_owner.owner, 'utf8')), 'hex'), null);
    insert into public.waitlist_entries (business_id, service_id, start_at, customer_name, customer_phone, cancel_token_hash)
    values (v_owner.business_id, v_owner.service_id, date_trunc('hour', now()) + interval '4 days',
      'Espera Teste', '11977776666', encode(sha256(convert_to('waitlist-' || v_owner.owner, 'utf8')), 'hex'))
    returning id into v_entry;
    insert into mfa_gate_fixture values (v_owner.owner, v_booking.id, v_entry, v_owner.service_id);
  end loop;
end;
$$;

-- Calls one owner RPC as the given JWT claims and reports 'OK' or the error.
-- The sentinel exception rolls back the call's writes and the role switch.
create function pg_temp.call_owner_rpc(p_owner text, p_claims jsonb, p_rpc text)
returns text
language plpgsql
as $$
declare
  v_fixture mfa_gate_fixture;
  v_hash text := repeat('b', 64);
begin
  select * into strict v_fixture from mfa_gate_fixture where owner = p_owner;
  begin
    perform set_config('request.jwt.claims', p_claims::text, true);
    execute 'set local role authenticated';
    case p_rpc
      when 'create_owner_booking' then
        perform public.create_owner_booking(v_fixture.service_id, date_trunc('hour', now()) + interval '5 days',
          'Cliente Novo', '11966665555', v_hash);
      when 'reschedule_owner_booking' then
        perform public.reschedule_owner_booking(v_fixture.booking_id, date_trunc('hour', now()) + interval '6 days');
      when 'notify_waitlist_entry' then
        perform public.notify_waitlist_entry(v_fixture.entry_id);
      when 'convert_waitlist_entry' then
        perform public.convert_waitlist_entry(v_fixture.entry_id, v_hash);
    end case;
    raise exception 'MFA_GATE_TEST_OK';
  exception when others then
    if sqlerrm = 'MFA_GATE_TEST_OK' then
      return 'OK';
    end if;
    return sqlerrm;
  end;
end;
$$;

do $$
declare
  c record;
  v_actual text;
  v_allowed boolean;
begin
  for c in
    select * from (values
      -- Verified factor, no aal claim: refused like the RLS policies refuse it.
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1"}', 'create_owner_booking', 'BUSINESS_NOT_FOUND'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1"}', 'reschedule_owner_booking', 'BUSINESS_NOT_FOUND'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1"}', 'notify_waitlist_entry', 'WAITLIST_NOT_OWNER'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1"}', 'convert_waitlist_entry', 'WAITLIST_NOT_OWNER'),
      -- Verified factor at aal1: refused.
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal1"}', 'create_owner_booking', 'BUSINESS_NOT_FOUND'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal1"}', 'notify_waitlist_entry', 'WAITLIST_NOT_OWNER'),
      -- Verified factor at aal2, confirmed through the app: allowed.
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e1"}', 'create_owner_booking', 'OK'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e1"}', 'reschedule_owner_booking', 'OK'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e1"}', 'notify_waitlist_entry', 'OK'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e1"}', 'convert_waitlist_entry', 'OK'),
      -- Verified factor at aal2 confirmed straight against Supabase Auth, or
      -- without a session: refused (GHSA-vjcg).
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e2"}', 'create_owner_booking', 'BUSINESS_NOT_FOUND'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e2"}', 'reschedule_owner_booking', 'BUSINESS_NOT_FOUND'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e2"}', 'notify_waitlist_entry', 'WAITLIST_NOT_OWNER'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e2"}', 'convert_waitlist_entry', 'WAITLIST_NOT_OWNER'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2"}', 'create_owner_booking', 'BUSINESS_NOT_FOUND'),
      ('a', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2"}', 'notify_waitlist_entry', 'WAITLIST_NOT_OWNER'),
      -- No factor at aal1 (opt-in): allowed.
      ('b', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1","aal":"aal1"}', 'create_owner_booking', 'OK'),
      ('b', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1","aal":"aal1"}', 'reschedule_owner_booking', 'OK'),
      ('b', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1","aal":"aal1"}', 'notify_waitlist_entry', 'OK'),
      ('b', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1","aal":"aal1"}', 'convert_waitlist_entry', 'OK'),
      -- No factor, no aal claim: refused as well.
      ('b', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1"}', 'create_owner_booking', 'BUSINESS_NOT_FOUND'),
      ('b', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1"}', 'convert_waitlist_entry', 'WAITLIST_NOT_OWNER')
    ) as t(owner, claims, rpc, expected)
  loop
    v_actual := pg_temp.call_owner_rpc(c.owner, c.claims::jsonb, c.rpc);
    if v_actual is distinct from c.expected then
      raise exception '% as % with %: expected %, got %', c.rpc, c.owner, c.claims, c.expected, v_actual;
    end if;
  end loop;

  -- The helper itself never returns NULL for an authenticated JWT.
  for c in
    select * from (values
      ('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1"}', false),
      ('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1"}', false),
      ('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal1"}', false),
      ('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e1"}', true),
      ('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000a0e2"}', false),
      ('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a0a1","aal":"aal2"}', false),
      ('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1","aal":"aal1"}', true),
      ('{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b0b1","aal":"aal2"}', true)
    ) as t(claims, expected)
  loop
    perform set_config('request.jwt.claims', c.claims, true);
    v_allowed := private.mfa_aal_allowed();
    if v_allowed is distinct from c.expected then
      raise exception 'mfa_aal_allowed() with %: expected %, got %', c.claims, c.expected, v_allowed;
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

rollback;

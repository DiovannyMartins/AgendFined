-- Regression test for supabase/migrations/20261017030000_normalize_customer_phones.sql.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/normalize-customer-phones.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ===========================================================================
-- 1. private.normalize_customer_phone mirrors customerPhoneSchema. The same
--    cases are checked against the schema by
--    tests/support/normalize-customer-phones.test.ts, so keep one per line.
-- ===========================================================================
do $$
declare
  c record;
  v_actual text;
begin
  for c in
    select * from (values
      -- cases:begin
      ('(11) 98888-7777', '11988887777'),
      ('11988887777', '11988887777'),
      ('+55 11 98888-7777', '11988887777'),
      ('5511988887777', '11988887777'),
      ('+5511988887777', '11988887777'),
      ('  (11) 98888-7777  ', '11988887777'),
      ('(21) 3333-4444', '2133334444'),
      ('+55 (21) 3333-4444', '2133334444'),
      ('552133334444', '2133334444'),
      ('(55) 99999-8888', '55999998888'),
      ('abcdefgh', null),
      ('12345678', null),
      ('98888-7777', null),
      ('(01) 98888-7777', null),
      ('(10) 98888-7777', null),
      ('(11) 88888-7777', null),
      ('(11) 9888-7777', null),
      ('(11) 1888-7777', null),
      ('+1 415 555 2671', null),
      ('+351 912 345 678', null),
      ('11 98888-7777 ramal 2', null),
      ('(11) 98888-7777 / (11) 98888-7777', null),
      ('   ', null),
      -- cases:end
      (null, null)
    ) as t(input, expected)
  loop
    v_actual := private.normalize_customer_phone(c.input);
    if v_actual is distinct from c.expected then
      raise exception 'normalize_customer_phone(%) = %, expected %', c.input, v_actual, c.expected;
    end if;
  end loop;
end;
$$;

-- ===========================================================================
-- 2. Fixtures: two negócios, legacy phone formats and conflicts.
-- ===========================================================================
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'phones-a@example.test', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'phones-b@example.test', '{}', '{}');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-4000-8000-0000000000a1', 'Dona A'),
  ('00000000-0000-4000-8000-0000000000b1', 'Dona B');

insert into public.businesses (id, owner_id, name, slug, phone, timezone, trial_ends_at)
values
  ('00000000-0000-4000-8000-00000000a000', '00000000-0000-4000-8000-0000000000a1', 'Negócio A', 'phones-test-a', '1133334444', 'America/Sao_Paulo', 'infinity'),
  ('00000000-0000-4000-8000-00000000b000', '00000000-0000-4000-8000-0000000000b1', 'Negócio B', 'phones-test-b', '1133334444', 'America/Sao_Paulo', 'infinity');

insert into public.services (id, business_id, name, duration_minutes, price_cents)
values ('00000000-0000-4000-8000-00000000a5e1', '00000000-0000-4000-8000-00000000a000', 'Corte', 30, 5000);

insert into public.customers (id, business_id, name, phone, email, created_at)
values
  -- Same phone in three formats: the oldest stays.
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000a000', 'Maria Antiga', '+55 (11) 98888-7777', null, '2026-01-01T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000a000', 'Maria Nova', '11988887777', 'maria@example.com', '2026-02-01T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000a000', 'Maria do Meio', '(11) 98888-7777', null, '2026-03-01T12:00:00Z'),
  -- No conflict: only the format changes.
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-00000000a000', 'João Fixo', '(21) 3333-4444', null, '2026-01-01T12:00:00Z'),
  -- Phones that do not normalize stay as they are.
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-00000000a000', 'Letras', 'abcdefgh', null, '2026-01-01T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-00000000a000', 'Estrangeiro', '+1 415 555 2671', null, '2026-01-01T12:00:00Z'),
  -- Same phone in another negócio: normalized, never merged across negócios.
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000b000', 'Maria em B', '+5511988887777', null, '2026-04-01T12:00:00Z');

insert into public.bookings (
  id, business_id, service_id, customer_id, customer_name_snapshot,
  customer_phone_snapshot, customer_email_snapshot, service_name_snapshot,
  duration_minutes_snapshot, price_cents_snapshot, start_at, end_at, status
)
values
  ('00000000-0000-4000-8000-00000000b0c1', '00000000-0000-4000-8000-00000000a000', '00000000-0000-4000-8000-00000000a5e1',
   '00000000-0000-4000-8000-0000000000c1', 'Maria Antiga', '+55 (11) 98888-7777', null, 'Corte', 30, 5000,
   '2026-01-10T13:00:00Z', '2026-01-10T13:30:00Z', 'completed'),
  ('00000000-0000-4000-8000-00000000b0c2', '00000000-0000-4000-8000-00000000a000', '00000000-0000-4000-8000-00000000a5e1',
   '00000000-0000-4000-8000-0000000000c2', 'Maria Nova', '11988887777', 'maria@example.com', 'Corte', 30, 5000,
   '2026-02-10T13:00:00Z', '2026-02-10T13:30:00Z', 'no_show'),
  ('00000000-0000-4000-8000-00000000b0c3', '00000000-0000-4000-8000-00000000a000', '00000000-0000-4000-8000-00000000a5e1',
   '00000000-0000-4000-8000-0000000000c3', 'Maria do Meio', '(11) 98888-7777', null, 'Corte', 30, 5000,
   now() + interval '20 days', now() + interval '20 days 30 minutes', 'confirmed');

insert into public.waitlist_entries (
  id, business_id, service_id, start_at, customer_name, customer_phone, customer_email, status, created_at
)
values
  -- Same slot and phone in two formats: the oldest stays, with the newest's
  -- name, status and (when present) e-mail.
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000a000', '00000000-0000-4000-8000-00000000a5e1',
   '2030-05-01T13:00:00Z', 'Maria Antiga', '(11) 98888-7777', 'antiga@example.com', 'cancelled', '2026-01-01T12:00:00Z'),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000a000', '00000000-0000-4000-8000-00000000a5e1',
   '2030-05-01T13:00:00Z', 'Maria Nova', '11988887777', null, 'pending', '2026-02-01T12:00:00Z'),
  -- Same phone, another slot: only the format changes.
  ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000a000', '00000000-0000-4000-8000-00000000a5e1',
   '2030-05-02T13:00:00Z', 'Maria Antiga', '+55 11 98888-7777', null, 'notified', '2026-01-01T12:00:00Z'),
  -- Does not normalize: stays as it is.
  ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000a000', '00000000-0000-4000-8000-00000000a5e1',
   '2030-05-01T13:00:00Z', 'Letras', 'abcdefgh', null, 'pending', '2026-01-01T12:00:00Z');

-- ===========================================================================
-- 3. Normalize and check every fixture.
-- ===========================================================================
select private.normalize_customer_phones();

do $$
declare
  v_customer public.customers;
  v_entry public.waitlist_entries;
begin
  -- Clientes.
  select * into v_customer from public.customers where id = '00000000-0000-4000-8000-0000000000c1';
  if v_customer.phone is distinct from '11988887777'
     or v_customer.name <> 'Maria Antiga'
     or v_customer.email is not null then
    raise exception 'oldest customer must keep its identity with the canonical phone: %', row_to_json(v_customer);
  end if;

  if exists (
    select 1 from public.customers
    where id in ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c3')
  ) then
    raise exception 'duplicate customers must be merged into the oldest';
  end if;

  if (select count(*) from public.bookings
      where id in ('00000000-0000-4000-8000-00000000b0c1', '00000000-0000-4000-8000-00000000b0c2', '00000000-0000-4000-8000-00000000b0c3')
        and customer_id = '00000000-0000-4000-8000-0000000000c1') <> 3 then
    raise exception 'every reserva of the merged customers must point to the oldest';
  end if;

  -- Snapshots are history and are never rewritten.
  if (select string_agg(customer_name_snapshot || '|' || customer_phone_snapshot || '|' || coalesce(customer_email_snapshot, '') || '|' || status, ',' order by start_at)
      from public.bookings
      where business_id = '00000000-0000-4000-8000-00000000a000')
     is distinct from 'Maria Antiga|+55 (11) 98888-7777||completed,Maria Nova|11988887777|maria@example.com|no_show,Maria do Meio|(11) 98888-7777||confirmed' then
    raise exception 'reserva snapshots and status must be preserved';
  end if;

  if (select phone from public.customers where id = '00000000-0000-4000-8000-0000000000c4') is distinct from '2133334444' then
    raise exception 'fixo must be normalized to DDD + número';
  end if;

  if (select phone from public.customers where id = '00000000-0000-4000-8000-0000000000c5') is distinct from 'abcdefgh'
     or (select phone from public.customers where id = '00000000-0000-4000-8000-0000000000c6') is distinct from '+1 415 555 2671' then
    raise exception 'phones that do not normalize must stay as they are';
  end if;

  if (select phone from public.customers where id = '00000000-0000-4000-8000-0000000000d1') is distinct from '11988887777' then
    raise exception 'customers of another negócio must be normalized but not merged';
  end if;

  -- Lista de espera.
  select * into v_entry from public.waitlist_entries where id = '00000000-0000-4000-8000-00000000e001';
  if v_entry.customer_phone is distinct from '11988887777'
     or v_entry.customer_name <> 'Maria Nova'
     or v_entry.customer_email is distinct from 'antiga@example.com'
     or v_entry.status <> 'pending'
     or v_entry.created_at <> '2026-01-01T12:00:00Z' then
    raise exception 'oldest waitlist entry must take the newest details: %', row_to_json(v_entry);
  end if;

  if exists (select 1 from public.waitlist_entries where id = '00000000-0000-4000-8000-00000000e002') then
    raise exception 'duplicate waitlist entries must be merged into the oldest';
  end if;

  select * into v_entry from public.waitlist_entries where id = '00000000-0000-4000-8000-00000000e003';
  if v_entry.customer_phone is distinct from '11988887777' or v_entry.status <> 'notified' then
    raise exception 'waitlist entry for another slot must only be normalized: %', row_to_json(v_entry);
  end if;

  if (select customer_phone from public.waitlist_entries where id = '00000000-0000-4000-8000-00000000e004') is distinct from 'abcdefgh' then
    raise exception 'waitlist phones that do not normalize must stay as they are';
  end if;
end;
$$;

-- ===========================================================================
-- 4. Running it again changes nothing.
-- ===========================================================================
do $$
declare
  v_result jsonb;
begin
  v_result := private.normalize_customer_phones();
  if (v_result->>'customers_normalized')::int <> 0
     or (v_result->>'customers_merged')::int <> 0
     or (v_result->>'bookings_repointed')::int <> 0
     or (v_result->>'waitlist_normalized')::int <> 0
     or (v_result->>'waitlist_merged')::int <> 0 then
    raise exception 'normalization must be idempotent: %', v_result;
  end if;
end;
$$;

-- ===========================================================================
-- 5. A new reserva with the canonical phone finds the existing cliente.
-- ===========================================================================
do $$
declare
  v_booking public.bookings;
begin
  v_booking := public.create_booking(
    '00000000-0000-4000-8000-00000000a000',
    '00000000-0000-4000-8000-00000000a5e1',
    date_trunc('hour', now()) + interval '10 days',
    'Maria Outra Vez',
    '11988887777',
    repeat('a', 64)
  );
  if v_booking.customer_id <> '00000000-0000-4000-8000-0000000000c1' then
    raise exception 'create_booking must reuse the normalized customer, got %', v_booking.customer_id;
  end if;
end;
$$;

rollback;
select 'customer phone normalization passed; transaction rolled back' as result;

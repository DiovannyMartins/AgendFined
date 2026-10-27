-- Hardening de grants e triggers (20261027000000_security_hardening_grants_triggers).
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/security-hardening-grants-triggers.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function pg_temp.new_business(p_tag text)
returns table (owner_id uuid, business_id uuid, service_id uuid)
language plpgsql
as $$
declare
  v_owner uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
  v_service uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'hardening-' || p_tag || '@example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono ' || p_tag);
  insert into public.businesses (id, owner_id, name, slug, phone, timezone)
  values (v_business, v_owner, 'Negocio ' || p_tag, 'hardening-' || p_tag, '11988887777', 'America/Sao_Paulo');
  insert into public.services (id, business_id, name, duration_minutes, price_cents)
  values (v_service, v_business, 'Corte', 30, 5000);
  return query select v_owner, v_business, v_service;
end;
$$;

create function pg_temp.new_booking(p_business uuid, p_service uuid, p_start timestamptz, p_token_hash text default null)
returns uuid
language plpgsql
as $$
declare
  v_customer uuid;
  v_booking uuid;
begin
  insert into public.customers (business_id, name, phone)
  values (p_business, 'Cliente', '+55119' || lpad((floor(random() * 100000000))::text, 8, '0'))
  returning id into v_customer;
  insert into public.bookings (
    business_id, service_id, customer_id, customer_name_snapshot, customer_phone_snapshot,
    service_name_snapshot, duration_minutes_snapshot, price_cents_snapshot,
    start_at, end_at, status, cancel_token_hash
  )
  values (
    p_business, p_service, v_customer, 'Cliente', '+5511977776666', 'Corte', 30, 5000,
    p_start, p_start + interval '30 minutes', 'confirmed', p_token_hash
  )
  returning id into v_booking;
  return v_booking;
end;
$$;

-- Runs p_sql and returns the exception message, or null when it succeeded.
create function pg_temp.error_of(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

create function pg_temp.act_as(p_user uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true),
    set_config('request.jwt.claim.sub', p_user::text, true);
$$;

grant execute on all functions in schema pg_temp to authenticated;

-- 1. completed/no_show only after the reserva started (isTooEarlyFor).
do $$
declare
  v record := pg_temp.new_business('status');
  v_future uuid := pg_temp.new_booking(v.business_id, v.service_id, date_trunc('hour', now()) + interval '2 days');
  v_past uuid := pg_temp.new_booking(v.business_id, v.service_id, date_trunc('hour', now()) - interval '2 days');
  v_err text;
begin
  foreach v_err in array array['completed', 'no_show'] loop
    v_err := pg_temp.error_of(format('update public.bookings set status = %L where id = %L', v_err, v_future));
    if v_err is distinct from 'BOOKING_NOT_STARTED' then
      raise exception 'future reserva must not be marked done, got %', v_err;
    end if;
  end loop;

  update public.bookings set status = 'cancelled' where id = v_future;

  update public.bookings set status = 'no_show' where id = v_past;
  update public.bookings set status = 'completed' where id = v_past;
  if (select status from public.bookings where id = v_past) <> 'completed' then
    raise exception 'a started reserva must accept completed/no_show and their correction';
  end if;
end;
$$;

-- 2. Waitlist RPCs: same error for a missing and a foreign entry; a cancelled
-- entry is neither notified nor converted.
do $$
declare
  v record := pg_temp.new_business('wl-own');
  v_other record := pg_temp.new_business('wl-other');
  v_entry uuid;
  v_foreign uuid;
  v_err text;
  v_missing text;
  v_cancelled_err text;
  v_converted text;
  v_source text;
begin
  update public.businesses set plan = 'pro' where id in (v.business_id, v_other.business_id);

  insert into public.waitlist_entries (business_id, service_id, start_at, customer_name, customer_phone, cancel_token_hash)
  values (v.business_id, v.service_id, date_trunc('hour', now()) + interval '3 days', 'Fila', '+5511977775555', repeat('a', 64))
  returning id into v_entry;
  insert into public.waitlist_entries (business_id, service_id, start_at, customer_name, customer_phone, cancel_token_hash)
  values (v_other.business_id, v_other.service_id, date_trunc('hour', now()) + interval '3 days', 'Fila', '+5511977775555', repeat('b', 64))
  returning id into v_foreign;

  perform public.cancel_waitlist_entry_by_token(repeat('a', 64));

  perform pg_temp.act_as(v.owner_id);
  set local role authenticated;
  v_missing := pg_temp.error_of(format('select public.notify_waitlist_entry(%L)', gen_random_uuid()));
  v_err := pg_temp.error_of(format('select public.notify_waitlist_entry(%L)', v_foreign));
  v_cancelled_err := pg_temp.error_of(format('select public.notify_waitlist_entry(%L)', v_entry));
  v_converted := pg_temp.error_of(format('select public.convert_waitlist_entry(%L, %L)', v_entry, repeat('c', 64)));
  if v_missing is distinct from 'WAITLIST_NOT_OWNER' or v_err is distinct from 'WAITLIST_NOT_OWNER' then
    raise exception 'missing and foreign entries must fail alike, got % / %', v_missing, v_err;
  end if;
  v_err := pg_temp.error_of(format('select public.convert_waitlist_entry(%L, %L)', v_foreign, repeat('c', 64)));
  if v_err is distinct from 'WAITLIST_NOT_OWNER' then
    raise exception 'convert of a foreign entry must say WAITLIST_NOT_OWNER, got %', v_err;
  end if;
  reset role;

  if v_cancelled_err is distinct from 'WAITLIST_CANCELLED' or v_converted is distinct from 'WAITLIST_CANCELLED' then
    raise exception 'a cancelled entry must stay cancelled, got % / %', v_cancelled_err, v_converted;
  end if;
  if (select status from public.waitlist_entries where id = v_entry) <> 'cancelled' then
    raise exception 'cancelled entry was reopened';
  end if;

  -- The concurrent case needs two sessions; the row lock and the guarded
  -- UPDATE are what serialize it against cancel_waitlist_entry_by_token.
  foreach v_source in array array[
    pg_get_functiondef('public.notify_waitlist_entry(uuid)'::regprocedure),
    pg_get_functiondef('public.convert_waitlist_entry(uuid,text)'::regprocedure)
  ] loop
    if position('for update of e' in v_source) = 0
       or position('and status in (''pending'', ''notified'')' in v_source) = 0
       or position('WAITLIST_ENTRY_NOT_FOUND' in v_source) > 0 then
      raise exception 'waitlist RPC lost its lock or status guard';
    end if;
  end loop;
end;
$$;

-- 3. Only the claim-token form of set_booking_reminders_sent remains.
do $$
begin
  if to_regprocedure('public.set_booking_reminders_sent(uuid[])') is not null then
    raise exception 'legacy set_booking_reminders_sent(uuid[]) must be dropped';
  end if;
  if to_regprocedure('public.set_booking_reminders_sent(uuid[],uuid[])') is null then
    raise exception 'set_booking_reminders_sent(uuid[], uuid[]) must remain';
  end if;
end;
$$;

-- 4. cancel_booking_by_public_code locks the negócio before the reserva and
-- still cancels.
do $$
declare
  v record := pg_temp.new_business('cancel');
  v_booking uuid := pg_temp.new_booking(v.business_id, v.service_id, date_trunc('hour', now()) + interval '2 days', repeat('d', 64));
  v_code text := (select public_code from public.bookings where id = v_booking);
  v_source text := pg_get_functiondef('public.cancel_booking_by_public_code(text,text,text)'::regprocedure);
  v_err text;
begin
  if position('from public.businesses' in v_source) = 0
     or position('from public.businesses' in v_source) > position('for update;' in v_source) then
    raise exception 'cancel_booking_by_public_code must lock businesses first';
  end if;

  v_err := pg_temp.error_of(format('select public.cancel_booking_by_public_code(%L, %L)', v_code, repeat('e', 64)));
  if v_err is distinct from 'CANCELLATION_REJECTED' then
    raise exception 'wrong token must be rejected, got %', v_err;
  end if;

  perform public.cancel_booking_by_public_code(v_code, repeat('d', 64), 'imprevisto');
  if (select status from public.bookings where id = v_booking) <> 'cancelled' then
    raise exception 'customer cancellation did not cancel';
  end if;
end;
$$;

-- 5. The owner reads the dashboard columns of bookings, never the reminder
-- claim token or the cliente's token hash.
do $$
declare
  v record := pg_temp.new_business('columns');
  v_booking uuid := pg_temp.new_booking(v.business_id, v.service_id, date_trunc('hour', now()) + interval '2 days');
  v_seen integer;
  v_err text;
begin
  if has_column_privilege('authenticated', 'public.bookings', 'reminder_claim_token', 'select')
     or has_column_privilege('authenticated', 'public.bookings', 'cancel_token_hash', 'select') then
    raise exception 'authenticated must not read reminder_claim_token or cancel_token_hash';
  end if;

  perform pg_temp.act_as(v.owner_id);
  set local role authenticated;
  select count(*) into v_seen
  from (
    select id, start_at, end_at, status, service_name_snapshot, duration_minutes_snapshot,
      customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot, public_code,
      cancel_reason, cancel_reason_category, cancelled_by, rescheduled_at, customer_note,
      customer_note_requires_follow_up, customer_id, price_cents_snapshot, service_id
    from public.bookings
    where business_id = v.business_id
  ) dashboard;
  v_err := pg_temp.error_of('select reminder_claim_token from public.bookings');
  update public.bookings set status = 'cancelled', cancel_reason = 'dono' where id = v_booking;
  reset role;

  if v_seen <> 1 then
    raise exception 'owner must still read the dashboard columns, saw % rows', v_seen;
  end if;
  if v_err not like 'permission denied%' then
    raise exception 'reading reminder_claim_token must be denied, got %', v_err;
  end if;
  if (select status from public.bookings where id = v_booking) <> 'cancelled' then
    raise exception 'owner must still cancel through the column-level update';
  end if;
end;
$$;

-- 6. authenticated holds no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN in public,
-- nothing on booking_rate_limits, and a write only where an RLS policy
-- permits it.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s:%s', c.relname, p.privilege), ', ') into v_bad
  from pg_class c
  cross join unnest(array['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN']) as p(privilege)
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm')
    and has_table_privilege('authenticated', c.oid, p.privilege);
  if v_bad is not null then
    raise exception 'authenticated keeps unneeded privileges: %', v_bad;
  end if;

  if has_table_privilege('authenticated', 'public.booking_rate_limits', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'authenticated must have no access to booking_rate_limits';
  end if;

  select string_agg(format('%s:%s', c.relname, p.privilege), ', ') into v_bad
  from pg_class c
  cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as p(privilege)
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and (has_table_privilege('authenticated', c.oid, p.privilege)
      or (p.privilege <> 'DELETE' and has_any_column_privilege('authenticated', c.oid, p.privilege)))
    and not exists (
      select 1 from pg_policies pol
      where pol.schemaname = 'public'
        and pol.tablename = c.relname
        and pol.permissive = 'PERMISSIVE'
        and pol.cmd in (p.privilege, 'ALL')
        and ('authenticated' = any(pol.roles) or 'public' = any(pol.roles))
    );
  if v_bad is not null then
    raise exception 'authenticated can write without an RLS policy: %', v_bad;
  end if;
end;
$$;

rollback;

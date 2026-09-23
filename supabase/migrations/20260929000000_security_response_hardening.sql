-- Security response hardening:
-- - independent digest-only cancellation capability
-- - cryptographic public reference generation
-- - deny anonymous base-table enumeration

alter table public.bookings
  add column if not exists cancel_token_hash text;

alter table public.bookings
  drop constraint if exists bookings_cancel_token_hash_format;

alter table public.bookings
  add constraint bookings_cancel_token_hash_format
  check (cancel_token_hash is null or cancel_token_hash ~ '^[0-9a-f]{64}$');

comment on column public.bookings.cancel_token_hash is
  'SHA-256 hex digest of the private customer cancellation capability; raw token is never stored.';

create or replace function public.generate_public_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
  v_bytes bytea;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    select string_agg(
      substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (get_byte(v_bytes, i) % 32) + 1, 1),
      '' order by i
    )
    into v_code
    from generate_series(0, 7) as i;

    exit when not exists (
      select 1 from public.bookings where public_code = v_code
    );
  end loop;
  return v_code;
end;
$$;

revoke all on function public.generate_public_code() from public, anon, authenticated;
grant execute on function public.generate_public_code() to service_role;

drop function if exists public.create_booking(uuid, uuid, timestamptz, text, text, text, text);

create function public.create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_cancel_token_hash text,
  p_customer_email text default null,
  p_customer_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_service public.services;
  v_customer public.customers;
  v_booking public.bookings;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CANCEL_TOKEN_HASH';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id
  for update;

  if v_business is null then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;
  if not v_business.is_active then
    raise exception 'BUSINESS_INACTIVE';
  end if;
  if p_start_at < now() + make_interval(mins => v_business.min_notice_minutes) then
    raise exception 'BOOKING_BEFORE_MIN_NOTICE';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and business_id = p_business_id
  for update;

  if v_service is null then
    raise exception 'SERVICE_NOT_FOUND';
  end if;
  if not v_service.is_active then
    raise exception 'SERVICE_INACTIVE';
  end if;

  insert into public.customers (business_id, name, phone, email)
  values (p_business_id, p_customer_name, p_customer_phone, p_customer_email)
  on conflict (business_id, phone)
  do update set
    name = excluded.name,
    email = coalesce(excluded.email, public.customers.email)
  returning * into v_customer;

  insert into public.bookings (
    business_id, service_id, customer_id, customer_name_snapshot,
    customer_phone_snapshot, customer_email_snapshot, service_name_snapshot,
    duration_minutes_snapshot, price_cents_snapshot, start_at, end_at,
    customer_note, cancel_token_hash
  )
  values (
    p_business_id, v_service.id, v_customer.id, p_customer_name,
    p_customer_phone, p_customer_email, v_service.name,
    v_service.duration_minutes, v_service.price_cents, p_start_at,
    p_start_at + make_interval(mins => v_service.duration_minutes),
    p_customer_note, p_cancel_token_hash
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text, text)
  to service_role;

drop function if exists public.cancel_booking_by_public_code(text, text);

create function public.cancel_booking_by_public_code(
  p_code text,
  p_cancel_token_hash text,
  p_cancel_reason text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CANCELLATION_REJECTED';
  end if;

  select * into v_booking
  from public.bookings
  where public_code = p_code
    and cancel_token_hash = p_cancel_token_hash
  for update;

  if v_booking is null or v_booking.status <> 'confirmed' then
    raise exception 'CANCELLATION_REJECTED';
  end if;

  update public.bookings
  set status = 'cancelled',
      cancel_reason = nullif(p_cancel_reason, ''),
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.cancel_booking_by_public_code(text, text, text)
  from public, anon, authenticated;
grant execute on function public.cancel_booking_by_public_code(text, text, text)
  to service_role;

revoke all privileges on table
  public.profiles,
  public.businesses,
  public.services,
  public.availability,
  public.availability_blocks,
  public.customers,
  public.bookings,
  public.booking_rate_limits,
  public.waitlist_entries,
  public.subscriptions,
  public.billing_attempts,
  public.billing_reconciliation_claims
from anon;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;

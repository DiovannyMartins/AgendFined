-- Align the saved window with the largest supported plan window and enforce
-- the effective window in the privileged booking RPC as the final authority.

alter table public.businesses
  drop constraint if exists businesses_booking_window_days_check;

alter table public.businesses
  add constraint businesses_booking_window_days_check
  check (booking_window_days between 1 and 365);

create or replace function public.create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
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
  v_effective_window_days integer;
  v_last_bookable_date date;
begin
  -- Keep the established lock order shared with service deletion and serialize
  -- against concurrent plan/window changes for this business.
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

  v_effective_window_days := least(
    v_business.booking_window_days::integer,
    case when v_business.plan = 'pro' then 365 else 90 end
  );
  v_last_bookable_date :=
    (now() at time zone 'America/Sao_Paulo')::date + v_effective_window_days;

  if (p_start_at at time zone 'America/Sao_Paulo')::date > v_last_bookable_date then
    raise exception 'BOOKING_OUTSIDE_PLAN_WINDOW';
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
    customer_note
  )
  values (
    p_business_id, v_service.id, v_customer.id, p_customer_name,
    p_customer_phone, p_customer_email, v_service.name,
    v_service.duration_minutes, v_service.price_cents, p_start_at,
    p_start_at + make_interval(mins => v_service.duration_minutes),
    p_customer_note
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text)
  to service_role;

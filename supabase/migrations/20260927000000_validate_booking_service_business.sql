-- A booking must never combine a business with a service owned by another
-- business, even when the security-definer RPC is called directly.
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
set search_path = public
as $$
declare
  v_service public.services;
  v_customer public.customers;
  v_booking public.bookings;
begin
  select * into v_service
  from public.services
  where id = p_service_id
    and business_id = p_business_id
    and is_active = true;

  if v_service is null then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  insert into public.customers (business_id, name, phone, email)
  values (p_business_id, p_customer_name, p_customer_phone, p_customer_email)
  on conflict (business_id, phone)
  do update set name = excluded.name, email = coalesce(excluded.email, public.customers.email)
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

revoke all on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text) to service_role;

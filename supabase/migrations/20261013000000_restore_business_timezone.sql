-- Restore per-business IANA timezone support after the former fixed-timezone
-- migration. Existing businesses keep the previous product default.

alter table public.businesses
  add column if not exists timezone text;

update public.businesses
set timezone = 'America/Sao_Paulo'
where timezone is null or btrim(timezone) = '';

alter table public.businesses
  alter column timezone set default 'America/Sao_Paulo',
  alter column timezone set not null;

alter table public.google_calendar_connections
  add column if not exists calendar_timezone text;

-- Public catalog projection now carries only the business timezone in addition
-- to the existing public fields. No private settings or tokens are exposed.
drop function if exists public.get_public_business(text);

create function public.get_public_business(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  timezone text
)
language sql
security definer
set search_path = ''
as $$
  select b.id, b.name, b.slug, b.description, b.timezone
  from public.businesses b
  where b.slug = p_slug
    and b.is_active = true
$$;

revoke all on function public.get_public_business(text) from public;
grant execute on function public.get_public_business(text) to anon, authenticated, service_role;

-- Public booking lookup is server-only; returning the business timezone lets
-- confirmation and consultation pages render the same wall-clock time as the
-- booking widget.
drop function if exists public.get_booking_by_public_code(text);

create function public.get_booking_by_public_code(p_code text)
returns table (
  service_name text,
  start_at timestamptz,
  end_at timestamptz,
  business_name text,
  business_slug text,
  business_phone text,
  business_timezone text
)
language sql
security definer
set search_path = ''
as $$
  select
    b.service_name_snapshot,
    b.start_at,
    b.end_at,
    bus.name,
    bus.slug,
    bus.phone,
    bus.timezone
  from public.bookings b
  join public.businesses bus on bus.id = b.business_id
  where b.public_code = p_code
$$;

revoke all on function public.get_booking_by_public_code(text) from public, anon, authenticated;
grant execute on function public.get_booking_by_public_code(text) to service_role;

-- The booking RPC remains the final authority for the plan window, but the
-- date is now evaluated in the business's own local timezone.
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
  select * into v_business
  from public.businesses
  where id = p_business_id
  for update;

  if v_business is null then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if not v_business.is_active then raise exception 'BUSINESS_INACTIVE'; end if;

  v_effective_window_days := least(
    v_business.booking_window_days::integer,
    case when v_business.plan = 'pro' then 365 else 90 end
  );
  v_last_bookable_date :=
    (now() at time zone v_business.timezone)::date + v_effective_window_days;

  if (p_start_at at time zone v_business.timezone)::date > v_last_bookable_date then
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

  if v_service is null then raise exception 'SERVICE_NOT_FOUND'; end if;
  if not v_service.is_active then raise exception 'SERVICE_INACTIVE'; end if;

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

-- Reminder e-mails must render in the same business timezone as the public
-- booking and calendar event.
drop function if exists public.get_due_booking_reminders(integer);

create function public.get_due_booking_reminders(
  p_lead_minutes integer default 1440
)
returns table (
  id uuid,
  business_id uuid,
  business_name text,
  business_slug text,
  business_timezone text,
  customer_name_snapshot text,
  customer_email_snapshot text,
  service_name_snapshot text,
  start_at timestamptz,
  public_code text,
  reminder_claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select b.id
    from public.bookings b
    join public.businesses bus on bus.id = b.business_id
    where bus.plan = 'pro'
      and b.status = 'confirmed'
      and b.reminder_sent_at is null
      and b.customer_email_snapshot is not null
      and b.customer_email_snapshot <> ''
      and b.start_at > now()
      and b.start_at <= now() + make_interval(mins => greatest(1, least(p_lead_minutes, 1440)))
      and (b.reminder_claimed_at is null or b.reminder_claimed_at < now() - interval '15 minutes')
    order by b.start_at asc
    limit 50
    for update of b skip locked
  ), claimed as (
    update public.bookings b
    set reminder_claimed_at = now(), reminder_claim_token = extensions.gen_random_uuid()
    from candidates c
    where b.id = c.id
    returning b.*
  )
  select
    b.id,
    b.business_id,
    bus.name,
    bus.slug,
    bus.timezone,
    b.customer_name_snapshot,
    b.customer_email_snapshot,
    b.service_name_snapshot,
    b.start_at,
    b.public_code,
    b.reminder_claim_token
  from claimed b
  join public.businesses bus on bus.id = b.business_id
  order by b.start_at asc;
end;
$$;

revoke all on function public.get_due_booking_reminders(integer) from public, anon, authenticated;
grant execute on function public.get_due_booking_reminders(integer) to service_role;

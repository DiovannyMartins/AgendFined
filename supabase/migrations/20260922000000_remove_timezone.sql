-- Migration: remove per-business timezone. The product operates only in
-- America/Sao_Paulo (APP_TIMEZONE in lib/app-timezone.ts); the configurable
-- `businesses.timezone` column and the `business_timezone` outputs are gone.

-- 1. Drop lookup function (return type changes) and recreate without timezone.
drop function if exists public.get_booking_by_public_code(text);

create or replace function public.get_booking_by_public_code(p_code text)
returns table (
  service_name text,
  start_at timestamptz,
  end_at timestamptz,
  business_name text,
  business_slug text,
  business_phone text
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
    bus.phone
  from public.bookings b
  join public.businesses bus on bus.id = b.business_id
  where b.public_code = p_code
$$;

revoke all on function public.get_booking_by_public_code(text) from public, anon, authenticated;
grant execute on function public.get_booking_by_public_code(text) to service_role;

-- 2. Reminder candidates without business_timezone.
drop function if exists public.get_due_booking_reminders(integer);

create or replace function public.get_due_booking_reminders(p_lead_minutes integer default 1440)
returns table (
  id uuid,
  business_id uuid,
  business_name text,
  business_slug text,
  customer_name_snapshot text,
  customer_email_snapshot text,
  service_name_snapshot text,
  start_at timestamptz,
  public_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    bk.id,
    bk.business_id,
    bus.name,
    bus.slug,
    bk.customer_name_snapshot,
    bk.customer_email_snapshot,
    bk.service_name_snapshot,
    bk.start_at,
    bk.public_code
  from public.bookings bk
  join public.businesses bus on bus.id = bk.business_id
  where bk.status = 'confirmed'
    and bk.reminder_sent_at is null
    and bk.customer_email_snapshot is not null
    and bk.customer_email_snapshot <> ''
    and bk.start_at > now()
    and bk.start_at <= now() + make_interval(mins => p_lead_minutes)
  order by bk.start_at asc;
end;
$$;

revoke all on function public.get_due_booking_reminders(integer) from public, anon, authenticated;
grant execute on function public.get_due_booking_reminders(integer) to service_role;

-- 3. Drop the column (apps now use APP_TIMEZONE = America/Sao_Paulo).
alter table public.businesses drop column if exists timezone;

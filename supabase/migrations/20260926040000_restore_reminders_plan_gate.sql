-- Restore the Pro-plan gate removed when the timezone-free reminder RPC was
-- recreated.

create or replace function public.get_due_booking_reminders(
  p_lead_minutes integer default 1440
)
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
  where bus.plan = 'pro'
    and bk.status = 'confirmed'
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

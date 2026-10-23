-- ===========================================================================
-- #149 item 25: the reminder e-mail now carries the negócio's phone (and the
-- link to /<slug>/consultar, built from business_slug in the Edge Function), so
-- the cliente can reach the negócio at the moment they most often cancel or
-- reschedule.
--
-- Adding a column to RETURNS TABLE changes the function's result type, which
-- CREATE OR REPLACE cannot do, so it is dropped and recreated in the same
-- transaction. Candidate filter, claim, posture and grants are unchanged from
-- 20261021020000.
-- ===========================================================================
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
  business_phone text,
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
declare
  v_lead interval := make_interval(mins => greatest(1, least(p_lead_minutes, 1440)));
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
      and b.start_at <= now() + v_lead
      and b.created_at < b.start_at - v_lead
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
    bus.phone,
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

-- ===========================================================================
-- #144 item 5: a reserva made inside the reminder lead (e.g. 3 h before it
-- starts) got the confirmação por e-mail and, on the next pg_cron tick, the
-- "Lembrete" with the same content. A reserva is now reminded only when it was
-- created before its own reminder window opened
-- (created_at < start_at - lead): one created later already has the
-- confirmation, sent moments ago, as its reminder.
--
-- Same signature, posture and grants as 20261013000000; only the candidate
-- filter changes.
-- ===========================================================================
create or replace function public.get_due_booking_reminders(
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

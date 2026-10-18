-- Issue #110: the public confirmation and consultation screens rendered every
-- booking as "Reserva confirmada!" because the lookup did not expose the status.
-- The status is booking lifecycle data, not customer personal data (§16), so it
-- joins the explicit allowlist (ADR 0006). The return type changes, so the
-- function is dropped and recreated with the same server-only grants.
drop function if exists public.get_booking_by_public_code(text);

create function public.get_booking_by_public_code(p_code text)
returns table (
  service_name text,
  start_at timestamptz,
  end_at timestamptz,
  business_name text,
  business_slug text,
  business_phone text,
  business_timezone text,
  status public.booking_status
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
    bus.timezone,
    b.status
  from public.bookings b
  join public.businesses bus on bus.id = b.business_id
  where b.public_code = p_code
$$;

revoke all on function public.get_booking_by_public_code(text) from public, anon, authenticated;
grant execute on function public.get_booking_by_public_code(text) to service_role;

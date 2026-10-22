-- #141: a cliente could cancel a reserva that had already started (or that
-- they missed), turning a future no-show into "cancelada" and notifying the
-- negócio about an appointment in the past. Self-service cancellation now
-- requires start_at > now().
--
-- The started check runs only after the code + capability digest match, so
-- every failure without a valid token keeps the generic CANCELLATION_REJECTED
-- (ADR 0005); only the token holder learns the reserva has started.
-- The owner's dashboard cancellation is unaffected.

create or replace function public.cancel_booking_by_public_code(
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

  if v_booking.start_at <= now() then
    raise exception 'BOOKING_ALREADY_STARTED';
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

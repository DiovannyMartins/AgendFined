-- ===========================================================================
-- #149 item 16: a reserva cancelled by the cliente and one cancelled by the
-- negócio looked the same in the agenda ("Cancelada"). bookings.cancelled_by
-- now records who did it:
--
--   * 'customer' — cancel_booking_by_public_code (the cancellation token
--     holder, ADR 0005) sets it explicitly;
--   * 'business' — any other move to cancelled, i.e. the owner's dashboard,
--     stamped by a trigger.
--
-- The owner still can write only status and the cancellation reason columns
-- (20261015000000_bookings_owner_write_guard): cancelled_by gets no column
-- grant, so the dashboard cannot pass a cancellation off as the cliente's.
-- Reservas cancelled before this migration keep cancelled_by null and show the
-- plain "Cancelada".
-- ===========================================================================
alter table public.bookings
  add column cancelled_by text
  constraint bookings_cancelled_by_check check (cancelled_by in ('customer', 'business'));

create or replace function public.stamp_booking_cancelled_by()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_by := coalesce(new.cancelled_by, 'business');
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_booking_cancelled_by() from public, anon, authenticated, service_role;

drop trigger if exists stamp_booking_cancelled_by on public.bookings;
create trigger stamp_booking_cancelled_by
  before update of status on public.bookings
  for each row execute function public.stamp_booking_cancelled_by();

-- Same body, posture and grants as 20261021000000; only cancelled_by is new.
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
      cancelled_by = 'customer',
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

-- The owner's session can reach PostgREST directly, so RLS alone let it rewrite
-- any column of its own reservas: snapshots, customer_email_snapshot and
-- reminder state (re-sending reminders to arbitrary addresses), and insert
-- reservas that skip Turnstile, rate limits and create_booking validation.
-- The dashboard only changes the status and the cancellation fields; every
-- other write goes through service_role or SECURITY DEFINER RPCs.
revoke insert on public.bookings from authenticated;
drop policy if exists bookings_insert_own on public.bookings;

revoke update on public.bookings from authenticated;
grant update (status, cancel_reason, cancel_reason_category) on public.bookings to authenticated;

-- Mirrors lib/bookings/transitions.ts (§11.2): a reserva leaves confirmed once
-- and terminal states are final, whichever role performs the update.
create or replace function public.enforce_booking_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and not (old.status = 'confirmed' and new.status in ('completed', 'cancelled', 'no_show')) then
    raise exception 'BOOKING_STATUS_TRANSITION_NOT_ALLOWED'
      using errcode = 'P0001',
      detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_booking_status_transition() from public, anon, authenticated, service_role;

drop trigger if exists enforce_booking_status_transition on public.bookings;
create trigger enforce_booking_status_transition
  before update of status on public.bookings
  for each row execute function public.enforce_booking_status_transition();

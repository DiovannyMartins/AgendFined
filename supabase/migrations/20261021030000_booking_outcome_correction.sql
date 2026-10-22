-- #145: a wrong click on Concluir or No-show could not be undone, leaving the
-- histórico, the no-show rate in Relatórios and the cliente's record wrong.
-- completed and no_show both describe an appointment that already happened,
-- so the owner may now correct one into the other. A reserva still leaves
-- confirmed only once, and cancelled stays final (its horário may already
-- have been rebooked under bookings_no_overlap).
--
-- Mirrors lib/bookings/transitions.ts. The owner can still only write the
-- status and cancellation columns (20261015000000_bookings_owner_write_guard).
create or replace function public.enforce_booking_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and not (
       (old.status = 'confirmed' and new.status in ('completed', 'cancelled', 'no_show'))
       or (old.status = 'completed' and new.status = 'no_show')
       or (old.status = 'no_show' and new.status = 'completed')
     ) then
    raise exception 'BOOKING_STATUS_TRANSITION_NOT_ALLOWED'
      using errcode = 'P0001',
      detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_booking_status_transition() from public, anon, authenticated, service_role;

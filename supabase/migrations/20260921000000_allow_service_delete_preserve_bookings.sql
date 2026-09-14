-- Migration: allow deleting a service that has booking history.
-- Before: bookings.service_id was NOT NULL with a composite FK
-- (service_id, business_id) -> services (id, business_id) and NO ACTION on
-- delete, so ANY booking (even old/cancelled) blocked the delete with 23503.
-- After: bookings.service_id is nullable with ON DELETE SET NULL. The booking
-- rows (and their snapshots) are preserved; only the link is cleared.
-- Display code already reads service_name_snapshot, never joins services.
--
-- The composite FK also enforced that a booking's service belongs to its
-- business. That guarantee is kept for new/changed rows by the trigger below
-- (only when service_id IS NOT NULL).

alter table public.bookings
  drop constraint if exists bookings_service_business_fkey;

alter table public.bookings
  alter column service_id drop not null;

alter table public.bookings
  add constraint bookings_service_id_fkey
  foreign key (service_id)
  references public.services (id)
  on delete set null;

create or replace function public.enforce_booking_service_business()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.service_id is not null and not exists (
    select 1
    from public.services s
    where s.id = new.service_id
      and s.business_id = new.business_id
  ) then
    raise exception 'SERVICE_BUSINESS_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_service_business on public.bookings;

create trigger trg_bookings_service_business
  before insert or update of service_id, business_id on public.bookings
  for each row execute function public.enforce_booking_service_business();

revoke all on function public.enforce_booking_service_business() from public, anon;
grant execute on function public.enforce_booking_service_business() to authenticated, service_role;

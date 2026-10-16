-- Changing the negócio timezone shifts the wall-clock meaning of availability
-- while scheduled reservas keep their UTC instants. The Server Actions refuse
-- the change when reservas are scheduled; enforce it here too, because the
-- owner session can update businesses through PostgREST directly. The
-- businesses row lock taken by this UPDATE also serializes with create_booking.
create or replace function public.prevent_timezone_change_with_scheduled_bookings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.timezone is distinct from old.timezone and exists (
    select 1 from public.bookings b
    where b.business_id = new.id
      and b.status = 'confirmed'
      and b.start_at > now()
  ) then
    raise exception 'BUSINESS_TIMEZONE_HAS_SCHEDULED_BOOKINGS'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_timezone_change_with_scheduled_bookings()
  from public, anon, authenticated, service_role;

drop trigger if exists prevent_timezone_change_with_scheduled_bookings on public.businesses;
create trigger prevent_timezone_change_with_scheduled_bookings
  before update of timezone on public.businesses
  for each row execute function public.prevent_timezone_change_with_scheduled_bookings();

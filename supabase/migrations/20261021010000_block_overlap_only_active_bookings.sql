-- ===========================================================================
-- #143: a bloqueio may start in the past ("fechei o resto do dia"), but the
-- §9.4 overlap trigger rejected it over any non-cancelled reserva, including
-- completed and no_show ones that already happened. The rule now covers only
-- reservas that can still happen: status = 'confirmed' and end_at > now().
--
-- The reverse trigger follows the same rule. A bloqueio may now cover a
-- reserva that already ended, so updating that reserva later (marking it
-- completed or no_show) must not be rejected. Inserting or moving a confirmed
-- reserva into a bloqueio is still rejected.
--
-- Same posture as 20260914000000: security invoker + '' search_path + the
-- 64-bit per-business lock.
-- ===========================================================================
create or replace function public.prevent_block_booking_overlap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.business_id::text, 0));
  if exists (
    select 1
    from public.bookings b
    where b.business_id = new.business_id
      and b.status = 'confirmed'
      and b.end_at > now()
      and tstzrange(new.start_at, new.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
  ) then
    raise exception 'BLOCK_BOOKING_OVERLAP';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_booking_block_overlap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.business_id::text, 0));
  if new.status = 'confirmed' and new.end_at > now() and exists (
    select 1
    from public.availability_blocks bl
    where bl.business_id = new.business_id
      and tstzrange(new.start_at, new.end_at, '[)') && tstzrange(bl.start_at, bl.end_at, '[)')
  ) then
    raise exception 'BOOKING_BLOCK_OVERLAP';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_block_booking_overlap() from public, anon;
grant execute on function public.prevent_block_booking_overlap() to authenticated, service_role;
revoke all on function public.prevent_booking_block_overlap() from public, anon;
grant execute on function public.prevent_booking_block_overlap() to authenticated, service_role;

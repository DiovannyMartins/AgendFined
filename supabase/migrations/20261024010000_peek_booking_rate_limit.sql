-- The business-wide limit of the public writes counted every attempt, before the
-- horário was validated: a crowd hitting taken horários at the opening of a new
-- agenda, or a few IPs on purpose, locked every cliente of the negócio out for
-- the rest of the window (#188). The counter now grows only once a reserva or
-- an entrada na lista de espera is written; before the write, the server only
-- reads it with this function.
--
-- Same fixed bucket as check_booking_rate_limit. It allows while fewer than
-- p_limit writes were counted, so p_limit writes fit in a window.

create or replace function public.peek_booking_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select l.count < p_limit
      from public.booking_rate_limits l
      where l.key = p_key
        and l.window_start = to_timestamp(
          floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1)
        )
    ),
    true
  );
$$;

revoke all on function public.peek_booking_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.peek_booking_rate_limit(text, integer, integer) to service_role;

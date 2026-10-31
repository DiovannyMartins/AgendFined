-- #216: the public page /[slug] made five calls, three of them in series, and
-- the slot lookup spent one round-trip per limiter key.
--
-- get_public_booking_page answers the page in one call. It follows ADR 0006:
-- explicit return type, every column an allowlist. The plan never leaves the
-- database: the page only learns what it uses from it, whether the lista de
-- espera is offered and the effective janela (configured days capped by the
-- plan: 365 for pro, 90 otherwise, as lib/plan/plan.ts). The phone is shown
-- only when the negócio cannot take reservas online, so it is returned only
-- then. Serviços are a JSON array built key by key, never from the row.

create function public.get_public_booking_page(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  timezone text,
  search_indexing_enabled boolean,
  offers_waitlist boolean,
  booking_window_days integer,
  has_availability boolean,
  phone text,
  services jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select b.*
    from public.businesses b
    where b.slug = p_slug
      and b.is_active = true
  ),
  s as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', sv.id,
          'name', sv.name,
          'description', sv.description,
          'duration_minutes', sv.duration_minutes,
          'price_cents', sv.price_cents
        )
        order by sv.created_at asc
      ),
      '[]'::jsonb
    ) as services
    from public.services sv
    join b on b.id = sv.business_id
    where sv.is_active = true
  ),
  a as (
    select exists (
      select 1
      from public.availability av
      join b on b.id = av.business_id
      where av.is_active = true
    ) as has_availability
  )
  select
    b.id,
    b.name,
    b.slug,
    b.description,
    b.timezone,
    b.search_indexing_enabled,
    b.plan = 'pro',
    least(b.booking_window_days, case when b.plan = 'pro' then 365 else 90 end),
    a.has_availability,
    case when jsonb_array_length(s.services) = 0 or not a.has_availability then b.phone end,
    s.services
  from b cross join s cross join a
$$;

revoke all on function public.get_public_booking_page(text) from public;
grant execute on function public.get_public_booking_page(text) to anon, authenticated, service_role;

-- Spends several limiter windows in one round-trip, in order, with the same
-- semantics as calling check_booking_rate_limit once per window from the
-- server: it stops at the first window over its limit, so later windows are
-- not spent. Each element is {"key": text, "limit": int, "window_seconds": int}.
create function public.check_booking_rate_limits(p_windows jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window jsonb;
begin
  for v_window in select value from jsonb_array_elements(p_windows)
  loop
    if not public.check_booking_rate_limit(
      v_window->>'key',
      (v_window->>'limit')::integer,
      (v_window->>'window_seconds')::integer
    ) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.check_booking_rate_limits(jsonb) from public, anon, authenticated;
grant execute on function public.check_booking_rate_limits(jsonb) to service_role;

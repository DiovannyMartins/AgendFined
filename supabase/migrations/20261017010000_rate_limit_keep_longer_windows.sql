-- check_booking_rate_limit swept every key whose window started before the
-- window of the current call. A 15-minute check (a login, a webhook) therefore
-- deleted the counters of longer windows of other keys: the hourly signup and
-- password reset limits, and the daily checkout limit, kept starting over.
--
-- The sweep is garbage collection only: a counter whose bucket ended is reset by
-- the upsert below. It now removes rows older than the longest window in use
-- (one day), or than the current window when that is longer.

create or replace function public.check_booking_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz;
  v_count integer;
begin
  if p_window_seconds < 1 then
    p_window_seconds := 1;
  end if;

  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  perform pg_advisory_xact_lock(hashtextextended('rl:' || p_key, 0));

  delete from public.booking_rate_limits
  where window_start < now() - make_interval(secs => greatest(p_window_seconds, 86400));

  insert into public.booking_rate_limits (key, window_start, count)
  values (p_key, v_bucket, 1)
  on conflict (key) do update set
    count = case when public.booking_rate_limits.window_start = v_bucket
                 then public.booking_rate_limits.count + 1
                 else 1 end,
    window_start = case when public.booking_rate_limits.window_start = v_bucket
                        then public.booking_rate_limits.window_start
                        else v_bucket end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_booking_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_booking_rate_limit(text, integer, integer) to service_role;

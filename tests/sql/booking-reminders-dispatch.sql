-- Regression test for #154: a malformed reminder dispatch URL fails loudly
-- instead of being swallowed by pg_net, and the health RPC reports the
-- dispatch wiring without ever returning the secret.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/booking-reminders-dispatch.sql
-- Runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_job_id bigint := (select jobid from cron.job where jobname = 'booking-reminders');
  v_secret text := 'test-secret-154-never-returned';
  v_health jsonb;
  v_raised boolean := false;
begin
  if v_job_id is null then
    raise exception 'cron job booking-reminders is not scheduled';
  end if;

  -- A CR inside the URL (CRLF .env) must abort the tick, not dispatch.
  perform set_config('app.reminder_cron_url', E'https://example.supabase.co\r/functions/v1/booking-reminders', true);
  perform set_config('app.reminder_cron_secret', v_secret, true);
  begin
    perform public.process_booking_reminders();
  exception when others then
    v_raised := sqlerrm like 'booking_reminders: invalid cron url%';
  end;
  if not v_raised then
    raise exception 'process_booking_reminders must reject a URL with control characters';
  end if;

  -- Without wiring in the job command, health says so.
  perform cron.alter_job(v_job_id, command := 'select public.process_booking_reminders()');
  v_health := public.get_booking_reminders_health();
  if (v_health->>'job_scheduled')::boolean is not true
     or (v_health->>'job_active')::boolean is not true
     or (v_health->>'dispatch_configured')::boolean is not false then
    raise exception 'health must report an unwired job, got %', v_health;
  end if;

  -- Wired with the CRLF URL: configured, but invalid.
  perform cron.alter_job(v_job_id, command := format(
    'select set_config(%L, %L, false); select set_config(%L, %L, false); select public.process_booking_reminders();',
    'app.reminder_cron_url', E'https://example.supabase.co\r/functions/v1/booking-reminders',
    'app.reminder_cron_secret', v_secret));
  v_health := public.get_booking_reminders_health();
  if (v_health->>'dispatch_configured')::boolean is not true
     or (v_health->>'url_valid')::boolean is not false then
    raise exception 'health must flag the malformed URL, got %', v_health;
  end if;

  -- Wired correctly: valid.
  perform cron.alter_job(v_job_id, command := format(
    'select set_config(%L, %L, false); select set_config(%L, %L, false); select public.process_booking_reminders();',
    'app.reminder_cron_url', 'https://example.supabase.co/functions/v1/booking-reminders',
    'app.reminder_cron_secret', v_secret));
  v_health := public.get_booking_reminders_health();
  if (v_health->>'url_valid')::boolean is not true
     or jsonb_typeof(v_health->'missed_reminders_7d') <> 'number' then
    raise exception 'health must accept the valid URL, got %', v_health;
  end if;
  if position(v_secret in v_health::text) > 0 then
    raise exception 'health must never return the cron secret';
  end if;

  if has_function_privilege('anon', 'public.get_booking_reminders_health()', 'execute')
     or has_function_privilege('authenticated', 'public.get_booking_reminders_health()', 'execute') then
    raise exception 'get_booking_reminders_health must be service_role only';
  end if;
end;
$$;

rollback;
select 'booking reminders dispatch regression passed; transaction rolled back' as result;

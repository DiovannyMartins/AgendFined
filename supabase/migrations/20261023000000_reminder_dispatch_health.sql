-- ===========================================================================
-- #154: the production reminder job had a CR inside its URL
-- ("https://<ref>.supabase.co\r/functions/v1/booking-reminders", read from a
-- CRLF .env.local by scripts/configure-booking-reminders.sh). pg_net reports
-- the failure only asynchronously in net._http_response, so every tick showed
-- `succeeded` in cron.job_run_details while no reminder was ever sent.
--
--   * process_booking_reminders() now rejects a malformed URL BEFORE claiming
--     candidates, raising an error so the tick shows `failed` with the reason.
--     Missing configuration is still a silent no-op (local/CI stacks).
--   * get_booking_reminders_health() lets `npm run check:launch -- --production`
--     and the operator see the dispatch wiring and missed reminders without
--     reading cron.job.command, which holds the secret. It never returns it.
--
-- Posture unchanged: security definer, `set search_path = ''`, service_role only.
-- ===========================================================================
create or replace function public.process_booking_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := current_setting('app.reminder_cron_url', true);
  v_secret text := current_setting('app.reminder_cron_secret', true);
  v_payload jsonb;
  v_count integer;
begin
  if v_url is null or v_secret is null then
    raise notice 'booking_reminders: no cron url/secret configured; nothing dispatched';
    return 0;
  end if;

  -- Same pattern as get_booking_reminders_health().url_valid.
  if v_url !~ '^https?://[^[:space:][:cntrl:]]+$' then
    raise exception 'booking_reminders: invalid cron url (whitespace or control character); nothing dispatched';
  end if;

  select jsonb_agg(to_jsonb(row))
  into v_payload
  from public.get_due_booking_reminders(1440) as row;

  if v_payload is null then
    return 0;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      body := v_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      )
    );
  exception when others then
    raise notice 'booking_reminders: dispatch failed (%); %', sqlstate, sqlerrm;
    return 0;
  end;

  select jsonb_array_length(v_payload) into v_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.process_booking_reminders() from public, anon, authenticated;
grant execute on function public.process_booking_reminders() to service_role;

-- A reminder is "missed" when it was claimed for dispatch, the booking still
-- happened (confirmed/completed) and no delivery was recorded before start_at.
create or replace function public.get_booking_reminders_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_url text;
  v_has_secret boolean;
  v_missed integer;
begin
  select j.active, j.schedule, j.command
  into v_job
  from cron.job j
  where j.jobname = 'booking-reminders';

  v_url := substring(v_job.command from 'app\.reminder_cron_url''\s*,\s*''([^'']*)''');
  v_has_secret := coalesce(v_job.command ~ 'app\.reminder_cron_secret''\s*,\s*''[^'']+''', false);

  select count(*)
  into v_missed
  from public.bookings b
  where b.reminder_claimed_at is not null
    and b.reminder_sent_at is null
    and b.status in ('confirmed', 'completed')
    and b.start_at between now() - interval '7 days' and now();

  return jsonb_build_object(
    'job_scheduled', v_job.command is not null,
    'job_active', coalesce(v_job.active, false),
    'schedule', v_job.schedule,
    'dispatch_configured', v_url is not null and v_has_secret,
    'url_valid', coalesce(v_url ~ '^https?://[^[:space:][:cntrl:]]+$', false),
    'missed_reminders_7d', v_missed
  );
end;
$$;

revoke all on function public.get_booking_reminders_health() from public, anon, authenticated;
grant execute on function public.get_booking_reminders_health() to service_role;

-- ===========================================================================
-- Reminder dispatch config moves from cron.job.command to Supabase Vault.
--
-- Until now scripts/configure-booking-reminders.sh wrote REMINDER_CRON_SECRET
-- in plain text into the booking-reminders job command (set_config calls), so
-- anyone able to read cron.job or cron.job_run_details saw the bearer. The
-- billing reconciliation already reads its URL/secret from Vault inside the
-- security definer function (20261012203926, 20261014010000); reminders now do
-- the same with:
--
--   agendfined_reminder_cron_url     https://<ref>.supabase.co/functions/v1/booking-reminders
--   agendfined_reminder_cron_secret  REMINDER_CRON_SECRET of the Edge Function
--
-- Transition: when either Vault entry is missing, process_booking_reminders()
-- still falls back to the app.reminder_cron_* settings, so a job scheduled the
-- old way keeps dispatching until the operator re-runs the script (which fills
-- Vault and reschedules the job without the secret). The health RPC reports
-- where the config came from and whether the job command still carries one.
--
-- Posture unchanged: security definer, `set search_path = ''`, service_role only.
-- ===========================================================================
create extension if not exists supabase_vault with schema vault;

create or replace function public.process_booking_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_payload jsonb;
  v_count integer;
begin
  select decrypted_secret
    into v_url
    from vault.decrypted_secrets
   where name = 'agendfined_reminder_cron_url';

  select decrypted_secret
    into v_secret
    from vault.decrypted_secrets
   where name = 'agendfined_reminder_cron_secret';

  -- Legacy wiring (set_config in the job command), only as a pair.
  if v_url is null or v_secret is null then
    v_url := current_setting('app.reminder_cron_url', true);
    v_secret := current_setting('app.reminder_cron_secret', true);
  end if;

  if nullif(v_url, '') is null or nullif(v_secret, '') is null then
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
-- Never returns the secret or the job command.
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
  v_source text;
  v_job_url text;
  v_job_has_secret boolean;
  v_missed integer;
begin
  select j.active, j.schedule, j.command
  into v_job
  from cron.job j
  where j.jobname = 'booking-reminders';

  v_job_url := substring(v_job.command from 'app\.reminder_cron_url''\s*,\s*''([^'']*)''');
  v_job_has_secret := coalesce(v_job.command ~ 'app\.reminder_cron_secret''\s*,\s*''[^'']+''', false);

  select decrypted_secret
    into v_url
    from vault.decrypted_secrets
   where name = 'agendfined_reminder_cron_url';

  select coalesce(length(decrypted_secret) > 0, false)
    into v_has_secret
    from vault.decrypted_secrets
   where name = 'agendfined_reminder_cron_secret';

  -- Mirrors process_booking_reminders(): Vault wins only as a complete pair.
  if v_url is not null and coalesce(v_has_secret, false) then
    v_source := 'vault';
  else
    v_url := v_job_url;
    v_has_secret := v_job_has_secret;
    v_source := case when v_job_url is not null and v_job_has_secret then 'job_command' end;
  end if;

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
    'dispatch_configured', v_url is not null and coalesce(v_has_secret, false),
    'dispatch_source', v_source,
    'secret_in_job_command', v_job_has_secret,
    'url_valid', coalesce(v_url ~ '^https?://[^[:space:][:cntrl:]]+$', false),
    'missed_reminders_7d', v_missed
  );
end;
$$;

revoke all on function public.get_booking_reminders_health() from public, anon, authenticated;
grant execute on function public.get_booking_reminders_health() to service_role;

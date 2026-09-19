-- Keep the reminder schedule valid on pg_cron versions that require a
-- standard cron expression. The operator-specific job command, including its
-- session-scoped secret setup, is preserved when the job already exists.
do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'booking-reminders'
  ) then
    perform cron.schedule(
      'booking-reminders',
      '*/30 * * * *',
      $job$select public.process_booking_reminders()$job$
    );
  end if;
exception when others then
  raise notice 'booking_reminders: cron schedule repair skipped (%).', sqlerrm;
end;
$$;

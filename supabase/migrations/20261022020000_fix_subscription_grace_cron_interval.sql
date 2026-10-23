-- #150: 20260918000000_webhook_preapproval_lifecycle.sql scheduled
-- 'subscription-grace-downgrade' with 'every 30 minutes', which pg_cron
-- rejects; the error was swallowed, so a freshly migrated database never
-- downgrades businesses whose grace period ended.
--
-- Schedule the job with a standard cron expression only when it is missing,
-- so a job an operator already created (production) is left untouched. The
-- downgrade is critical for billing, so a scheduling failure aborts the
-- migration instead of passing as a NOTICE. Only a database without pg_cron
-- at all is skipped, loudly.
do $$
begin
  if to_regclass('cron.job') is null then
    raise warning 'subscription_grace: pg_cron unavailable; subscription-grace-downgrade was NOT scheduled.';
    return;
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname = 'subscription-grace-downgrade'
  ) then
    perform cron.schedule(
      'subscription-grace-downgrade',
      '*/30 * * * *',
      $job$select public.downgrade_expired_subscriptions()$job$
    );
  end if;
end;
$$;

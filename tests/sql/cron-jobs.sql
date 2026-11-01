-- Regression test for #150: every critical pg_cron job exists on a freshly
-- migrated database, with a valid cron expression, active. The carência no
-- longer needs one (#261, fase 4): its end suspends the negócio by itself.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/cron-jobs.sql
-- Read-only; runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  c record;
  v_job cron.job%rowtype;
begin
  for c in
    select * from (values
      ('booking-reminders', 'public.process_booking_reminders()'),
      ('billing-reconciliation', 'public.process_billing_reconciliation()')
    ) as t(jobname, call)
  loop
    select * into v_job from cron.job where jobname = c.jobname;

    if not found then
      raise exception 'cron job % is not scheduled', c.jobname;
    end if;
    if v_job.schedule <> '*/30 * * * *' then
      raise exception 'cron job % has schedule %, expected */30 * * * *',
        c.jobname, v_job.schedule;
    end if;
    if not v_job.active then
      raise exception 'cron job % is inactive', c.jobname;
    end if;
    if position(c.call in v_job.command) = 0 then
      raise exception 'cron job % does not call %', c.jobname, c.call;
    end if;
  end loop;
end;
$$;

rollback;

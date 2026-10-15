-- Run with: supabase db query --linked --file tests/sql/reconciliation-scheduler.sql
-- pg_net dispatches only after commit. Roll back the queued request so this
-- regression test cannot execute billing or calendar work.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $$
declare
  request_id bigint;
begin
  request_id := public.process_billing_reconciliation();
  if request_id <= 0 then
    raise exception 'Scheduler did not dispatch through the HTTP boundary';
  end if;
  if not exists (
    select 1 from net.http_request_queue
    where id = request_id and timeout_milliseconds = 60000
      and method = 'POST'
      and length(headers->>'Authorization') > 7
      and url = 'https://agendfined.com.br/api/internal/reconciliation'
  ) then
    raise exception 'Scheduler must send an authenticated request with a 60-second timeout';
  end if;
end;
$$;

rollback;
select 'scheduler timeout regression passed; transaction rolled back' as result;

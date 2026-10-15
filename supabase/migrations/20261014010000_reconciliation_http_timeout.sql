-- Allow time for network setup, cold starts, billing and calendar synchronization.
-- The previous pg_net default (5 seconds) timed out before the HTTP response.
create or replace function public.process_billing_reconciliation()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
    into v_url
    from vault.decrypted_secrets
   where name = 'agendfined_reconciliation_cron_url';

  select decrypted_secret
    into v_secret
    from vault.decrypted_secrets
   where name = 'agendfined_reconciliation_cron_secret';

  if v_url is null or v_secret is null then
    raise notice 'billing_reconciliation: no Vault url/secret configured; nothing dispatched';
    return 0;
  end if;

  begin
    select net.http_post(
      url := v_url,
      timeout_milliseconds := 60000,
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      )
    )
    into v_request_id;
  exception when others then
    raise notice 'billing_reconciliation: dispatch failed (%); %', sqlstate, sqlerrm;
    return 0;
  end;

  return coalesce(v_request_id, 0);
end;
$$;

revoke all on function public.process_billing_reconciliation() from public, anon, authenticated;
grant execute on function public.process_billing_reconciliation() to service_role;



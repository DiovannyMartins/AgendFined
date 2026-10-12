-- Schedule the billing reconciliation safety net through Supabase pg_cron.
-- The HTTP target and bearer secret are operator configuration, kept out of
-- migrations and loaded from Supabase Vault at execution time.

create extension if not exists supabase_vault with schema vault;

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

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception when others then
  raise notice 'billing_reconciliation: extensions pg_cron/pg_net unavailable (%); the cron was not scheduled.', sqlerrm;
end;
$$;

do $$
begin
  perform cron.unschedule('billing-reconciliation');
exception when others then
  -- The job may not exist on the first application.
  null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'billing-reconciliation',
    '*/30 * * * *',
    $cron$select public.process_billing_reconciliation()$cron$
  );
exception when others then
  raise notice 'billing_reconciliation: cron not scheduled (%). %', sqlstate, sqlerrm;
end;
$$;

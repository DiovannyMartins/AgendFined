-- A retry reserves the current pending checkout (start_billing_retry) and then
-- waits on Mercado Pago to create the replacement. While it waits, the webhook
-- may make a paid superseded checkout the current assinatura. Linking the
-- replacement must not take the pointer back to an unpaid checkout, so the link
-- of a retry now compares the current subscription with the one it reserved,
-- under the business lock, and refuses when it moved.
create or replace function public.link_billing_attempt_subscription(
  p_attempt_id uuid,
  p_mp_preapproval_id text,
  p_status public.subscription_status default 'pending'
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.billing_attempts;
  v_subscription public.subscriptions;
  v_business public.businesses;
begin
  select * into v_attempt
  from public.billing_attempts
  where id = p_attempt_id
  for update;

  if v_attempt.id is null then
    raise exception 'BILLING_ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.status <> 'creating' then
    raise exception 'BILLING_ATTEMPT_NOT_CREATING';
  end if;

  select * into v_business
  from public.businesses
  where id = v_attempt.business_id
  for update;

  if v_business is null then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  if v_attempt.kind = 'retry'
     and v_business.current_subscription_id is distinct from v_attempt.expected_subscription_id then
    raise exception 'CURRENT_SUBSCRIPTION_CONFLICT';
  end if;

  insert into public.subscriptions (
    business_id,
    mp_preapproval_id,
    status,
    plan
  )
  values (
    v_attempt.business_id,
    p_mp_preapproval_id,
    p_status,
    'pro'
  )
  returning * into v_subscription;

  update public.businesses
  set current_subscription_id = v_subscription.id
  where id = v_attempt.business_id;

  update public.billing_attempts
  set status = 'linked',
      provider_preapproval_id = p_mp_preapproval_id,
      resolved_at = now()
  where id = p_attempt_id;

  return v_subscription;
end;
$$;

revoke all on function public.link_billing_attempt_subscription(uuid, text, public.subscription_status)
  from public, anon, authenticated;
grant execute on function public.link_billing_attempt_subscription(uuid, text, public.subscription_status)
  to service_role;

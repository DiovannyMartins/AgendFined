-- Billing phase 4: atomic local state transitions for the initial upgrade.
-- This migration does not change retry, webhooks, scheduler, or plan gates.

create or replace function public.start_billing_attempt(
  p_attempt_id uuid,
  p_idempotency_key text
)
returns public.billing_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.billing_attempts;
begin
  update public.billing_attempts
  set status = 'creating',
      claimed_at = coalesce(claimed_at, now())
  where id = p_attempt_id
    and idempotency_key = p_idempotency_key
    and status = 'reserved'
  returning * into v_attempt;

  if v_attempt.id is null then
    select * into v_attempt
    from public.billing_attempts
    where id = p_attempt_id;

    if v_attempt.id is null then
      raise exception 'BILLING_ATTEMPT_NOT_FOUND';
    end if;
  end if;

  return v_attempt;
end;
$$;

revoke all on function public.start_billing_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.start_billing_attempt(uuid, text) to service_role;

create or replace function public.finish_billing_attempt(
  p_attempt_id uuid,
  p_status public.billing_attempt_status,
  p_provider_preapproval_id text default null
)
returns public.billing_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.billing_attempts;
begin
  if p_status not in ('failed', 'unknown', 'ambiguous') then
    raise exception 'INVALID_BILLING_ATTEMPT_FINISH_STATUS';
  end if;

  update public.billing_attempts
  set status = p_status,
      provider_preapproval_id = coalesce(p_provider_preapproval_id, provider_preapproval_id),
      resolved_at = case when p_status = 'failed' then now() else null end
  where id = p_attempt_id
    and status = 'creating'
  returning * into v_attempt;

  if v_attempt.id is null then
    select * into v_attempt
    from public.billing_attempts
    where id = p_attempt_id;
  end if;

  if v_attempt.id is null then
    raise exception 'BILLING_ATTEMPT_NOT_FOUND';
  end if;

  return v_attempt;
end;
$$;

revoke all on function public.finish_billing_attempt(uuid, public.billing_attempt_status, text)
  from public, anon, authenticated;
grant execute on function public.finish_billing_attempt(uuid, public.billing_attempt_status, text)
  to service_role;

-- Links the provider object and its local subscription in one transaction.
-- The new pending subscription becomes current only through this explicit
-- operation; no webhook is involved in this phase.
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

-- Claims the expected pending subscription for a retry with a compare-and-swap
-- under the business lock. It does not call the provider.
create or replace function public.start_billing_retry(
  p_attempt_id uuid,
  p_idempotency_key text,
  p_expected_subscription_id uuid,
  p_expected_mp_preapproval_id text
)
returns public.billing_attempts
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
    and kind = 'retry'
    and idempotency_key = p_idempotency_key
  for update;
  if v_attempt.id is null then
    raise exception 'BILLING_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status <> 'reserved' then
    return v_attempt;
  end if;

  select * into v_business
  from public.businesses
  where id = v_attempt.business_id
  for update;
  if v_business is null then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  if v_business.current_subscription_id is distinct from p_expected_subscription_id then
    raise exception 'RETRY_SUBSCRIPTION_CONFLICT';
  end if;

  select * into v_subscription
  from public.subscriptions
  where id = p_expected_subscription_id
    and business_id = v_attempt.business_id
    and mp_preapproval_id = p_expected_mp_preapproval_id
    and status = 'pending'
  for update;
  if v_subscription is null then
    raise exception 'RETRY_SUBSCRIPTION_CONFLICT';
  end if;

  update public.billing_attempts
  set status = 'creating',
      expected_subscription_id = p_expected_subscription_id,
      claimed_at = coalesce(claimed_at, now())
  where id = p_attempt_id
  returning * into v_attempt;
  return v_attempt;
end;
$$;

revoke all on function public.start_billing_retry(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.start_billing_retry(uuid, text, uuid, text)
  to service_role;

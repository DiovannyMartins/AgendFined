-- An initial upgrade claims its attempt and then waits on Mercado Pago to create
-- the checkout. While it waits, the webhook may make a paid superseded checkout
-- the current assinatura. The claim of an initial now records the current
-- subscription it read under the business lock, and the link compares it for
-- every kind (not only retry), so linking the new checkout never takes the
-- pointer back to an unpaid one.
--
-- Reconciliation already fences on expected_subscription_id: an initial left
-- unknown while the negócio had a current subscription (Grátis with a closed
-- one, or PROFISSIONAL in carência) now reconciles like its link would have,
-- instead of always failing with 'current subscription changed'.

create or replace function public.claim_billing_attempt(
  p_business_id uuid,
  p_kind public.billing_attempt_kind,
  p_expected_subscription_id uuid default null,
  p_idempotency_key text default null
)
returns public.billing_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.billing_attempts;
  v_current_subscription_id uuid;
  v_key text := coalesce(nullif(p_idempotency_key, ''), extensions.gen_random_uuid()::text);
begin
  select current_subscription_id into v_current_subscription_id
  from public.businesses
  where id = p_business_id
  for update;

  if not found then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  select * into v_attempt
  from public.billing_attempts
  where idempotency_key = v_key;

  if v_attempt.id is not null then
    return v_attempt;
  end if;

  select * into v_attempt
  from public.billing_attempts
  where business_id = p_business_id
    and status in ('reserved', 'creating', 'unknown')
  order by created_at asc
  limit 1;

  if v_attempt.id is not null then
    return v_attempt;
  end if;

  -- A retry names the pending subscription it replaces (start_billing_retry
  -- checks it again); an initial records the pointer read under the lock.
  insert into public.billing_attempts (
    business_id,
    kind,
    status,
    idempotency_key,
    expected_subscription_id,
    claimed_at
  )
  values (
    p_business_id,
    p_kind,
    'reserved',
    v_key,
    case when p_kind = 'initial' then v_current_subscription_id else p_expected_subscription_id end,
    now()
  )
  returning * into v_attempt;

  return v_attempt;
end;
$$;

revoke all on function public.claim_billing_attempt(
  uuid,
  public.billing_attempt_kind,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.claim_billing_attempt(
  uuid,
  public.billing_attempt_kind,
  uuid,
  text
) to service_role;

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

  if v_business.current_subscription_id is distinct from v_attempt.expected_subscription_id then
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

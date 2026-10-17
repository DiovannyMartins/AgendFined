-- An initial upgrade claims its attempt and then waits on Mercado Pago to create
-- the checkout. While it waits, the webhook may make a paid superseded checkout
-- the current assinatura, or the current one may get paid (a recovered payment
-- in carência). The claim of an initial now records the current subscription it
-- read under the business lock, and the link, for every kind, refuses when the
-- pointer moved or when it names a paid assinatura.
--
-- Reconciliation fences on expected_subscription_id: an initial left unknown
-- while the negócio had a current subscription (Grátis with a closed one, or
-- PROFISSIONAL in carência) now reconciles like its link would have, instead of
-- always failing with 'current subscription changed'. It follows the same rules
-- as the link and closes a refused attempt as failed.
--
-- Initial attempts still active from before this migration get the pointer
-- recorded too (see the backfill at the end).

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

  -- The pointer may stay put while the assinatura it names gets paid (a
  -- recovered payment in carência, or the checkout a retry replaces). A paid
  -- assinatura is never replaced by a new unpaid checkout. The webhook changes
  -- a subscription's status only under this same business lock.
  if exists (
    select 1
    from public.subscriptions s
    where s.id = v_business.current_subscription_id
      and s.status = 'authorized'
  ) then
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

-- Reconciliation applies the same rules as the link: it never moves the
-- pointer when it no longer names the subscription the attempt read, nor away
-- from a paid assinatura. Such an attempt's checkout was never handed out, so
-- the attempt is closed as failed instead of staying unknown (which blocks every
-- later upgrade of the negócio). When Mercado Pago reports that checkout as paid
-- too, it is a double charge and the attempt stays for manual review.
create or replace function public.reconcile_billing_attempt_subscription(
  p_attempt_id uuid, p_mp_preapproval_id text, p_status public.subscription_status,
  p_current_period_start timestamptz default null, p_current_period_end timestamptz default null,
  p_grace_period_end timestamptz default null, p_claim_token uuid default null
) returns public.subscriptions
language plpgsql security definer set search_path = ''
as $$
declare
  a public.billing_attempts;
  b public.businesses;
  s public.subscriptions;
  v_count integer;
  v_current_paid boolean;
begin
  if p_claim_token is null or not exists (select 1 from public.billing_reconciliation_claims
    where resource_key = 'billing-attempt/' || p_attempt_id::text
      and claim_token = p_claim_token and claimed_until > now()) then raise exception 'CLAIM_LOST'; end if;
  select * into a from public.billing_attempts where id = p_attempt_id for update;
  if not found then raise exception 'billing attempt not found'; end if;
  if a.status not in ('unknown', 'ambiguous') then
    if a.status = 'linked' and a.provider_preapproval_id = p_mp_preapproval_id then
      select count(*) into v_count from public.subscriptions where mp_preapproval_id = p_mp_preapproval_id;
      if v_count > 1 then raise exception 'DUPLICATE_PROVIDER_LINK'; end if;
      select * into s from public.subscriptions where mp_preapproval_id = p_mp_preapproval_id; return s;
    end if;
    raise exception 'billing attempt is not reconcilable';
  end if;
  if a.provider_preapproval_id is not null and a.provider_preapproval_id <> p_mp_preapproval_id then
    raise exception 'provider preapproval conflicts with attempt'; end if;
  select * into b from public.businesses where id = a.business_id for update;
  if not found then raise exception 'business not found'; end if;
  select count(*) into v_count from public.subscriptions where mp_preapproval_id = p_mp_preapproval_id;
  if v_count > 1 then raise exception 'DUPLICATE_PROVIDER_LINK'; end if;
  if v_count = 1 then
    select * into s from public.subscriptions where mp_preapproval_id = p_mp_preapproval_id for update;
    if s.business_id <> a.business_id then raise exception 'provider preapproval belongs to another business'; end if;
  end if;

  v_current_paid := exists (select 1 from public.subscriptions
    where id = b.current_subscription_id and status = 'authorized');
  if b.current_subscription_id is not null
     and b.current_subscription_id is distinct from s.id
     and (a.expected_subscription_id is null
       or b.current_subscription_id <> a.expected_subscription_id
       or v_current_paid) then
    if p_status = 'authorized' then
      raise exception 'current subscription changed during reconciliation';
    end if;
    update public.billing_attempts set status = 'failed', provider_preapproval_id = p_mp_preapproval_id,
      resolved_at = now(), updated_at = now() where id = a.id and status in ('unknown', 'ambiguous');
    if not found then raise exception 'CLAIM_LOST'; end if;
    return null;
  end if;

  if v_count = 1 then
    if b.current_subscription_id is distinct from s.id and
       (a.expected_subscription_id is null or b.current_subscription_id is distinct from a.expected_subscription_id) then
      raise exception 'current subscription changed during reconciliation'; end if;
    if b.current_subscription_id is null and a.expected_subscription_id is null then
      raise exception 'HISTORICAL_SUBSCRIPTION_REQUIRES_REVIEW'; end if;
    update public.subscriptions set status = p_status, current_period_start = p_current_period_start,
      current_period_end = p_current_period_end, grace_period_end = p_grace_period_end
      where id = s.id returning * into s;
    if b.current_subscription_id is distinct from s.id then
      update public.businesses set current_subscription_id = s.id where id = b.id
        and current_subscription_id = a.expected_subscription_id;
      if not found then raise exception 'CURRENT_SUBSCRIPTION_CONFLICT'; end if;
    end if;
  else
    insert into public.subscriptions(business_id, mp_preapproval_id, plan, status,
      current_period_start, current_period_end, grace_period_end)
      values (a.business_id, p_mp_preapproval_id, 'pro', p_status,
        p_current_period_start, p_current_period_end, p_grace_period_end) returning * into s;
    update public.businesses set current_subscription_id = s.id where id = b.id
      and current_subscription_id is not distinct from a.expected_subscription_id;
    if not found then raise exception 'CURRENT_SUBSCRIPTION_CONFLICT'; end if;
  end if;
  if (select current_subscription_id from public.businesses where id = b.id) = s.id and p_status = 'authorized' then
    update public.businesses set plan = 'pro' where id = b.id;
  end if;
  update public.billing_attempts set status = 'linked', provider_preapproval_id = p_mp_preapproval_id,
    resolved_at = now(), updated_at = now() where id = a.id and status in ('unknown', 'ambiguous');
  if not found then raise exception 'CLAIM_LOST'; end if;
  return s;
end; $$;

revoke all on function public.reconcile_billing_attempt_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.reconcile_billing_attempt_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, timestamptz, uuid) to service_role;

-- Initial attempts claimed before this migration never recorded the pointer:
-- the ones left unknown could never reconcile, and the ones in flight would now
-- fail their link. Recording today's pointer instead of the one at claim time is
-- safe: while an attempt is active (one per negócio) only the webhook moves the
-- pointer, and only to a paid checkout, which the link and the reconciliation
-- refuse to replace. At worst a new checkout replaces an unpaid one, as the link
-- does.
update public.billing_attempts a
set expected_subscription_id = b.current_subscription_id
from public.businesses b
where b.id = a.business_id
  and a.kind = 'initial'
  and a.status in ('reserved', 'creating', 'unknown', 'ambiguous')
  and a.expected_subscription_id is null
  and b.current_subscription_id is not null;

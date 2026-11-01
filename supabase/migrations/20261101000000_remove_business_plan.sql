-- #261, fase 4 (ADR 0013, ADR 0008): the plano Grátis is gone, so the
-- `business_plan` enum, `businesses.plan` and `subscriptions.plan` go with it.
-- Access is `business_has_access()` (teste vigente, assinatura `authorized`
-- or carência vigente), computed from now(); nothing needs to record a plan.
--
-- * apply_subscription_snapshot / reconcile_billing_attempt_subscription no
--   longer set `plan = 'pro'` on an authorized assinatura, and the snapshot
--   result loses `effective_plan`.
-- * link_billing_attempt_subscription / reconcile insert subscriptions without
--   a plan.
-- * protect_business_plan (the trigger that kept a dono from setting his own
--   plan) has nothing to protect.
-- * downgrade_expired_subscriptions and its cron are dropped: the end of the
--   carência already removes the access, without waiting for a cron (FR-012).
--
-- Deploy the app of this change BEFORE this migration: it no longer reads
-- `plan` nor `effective_plan` and works with both schemas. The app before it
-- reads `businesses.plan` (ALREADY_PRO, the carência banner).

-- 1. The snapshot no longer promotes the negócio; its result loses the plan.
drop function public.apply_subscription_snapshot(
  uuid, uuid, text, public.subscription_status, timestamptz, timestamptz,
  timestamptz, boolean, uuid, timestamptz
);

create function public.apply_subscription_snapshot(
  p_business_id uuid,
  p_subscription_id uuid,
  p_mp_preapproval_id text,
  p_status public.subscription_status,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_grace_period_end timestamptz default null,
  p_make_current boolean default false,
  p_expected_current_subscription_id uuid default null,
  p_provider_modified_at timestamptz default null
)
returns table (
  subscription_id uuid,
  business_id uuid,
  subscription_status public.subscription_status,
  previous_status public.subscription_status,
  applied boolean,
  is_current boolean,
  effective_grace_period_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_subscription public.subscriptions;
  v_applied boolean;
  v_is_current boolean;
  v_effective_grace timestamptz;
begin
  select * into v_business
  from public.businesses
  where id = p_business_id
  for update;

  if v_business is null then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  select * into v_subscription
  from public.subscriptions s
  where s.id = p_subscription_id
    and s.business_id = p_business_id
    and s.mp_preapproval_id = p_mp_preapproval_id
  for update;

  if v_subscription is null then
    raise exception 'SUBSCRIPTION_NOT_FOUND';
  end if;

  v_applied := p_provider_modified_at is null
    or v_subscription.provider_modified_at is null
    or p_provider_modified_at >= v_subscription.provider_modified_at;

  if v_applied then
    if p_make_current
       and v_business.current_subscription_id is distinct from p_expected_current_subscription_id
    then
      raise exception 'CURRENT_SUBSCRIPTION_CONFLICT';
    end if;

    update public.subscriptions
    set status = p_status,
        current_period_start = p_current_period_start,
        current_period_end = p_current_period_end,
        grace_period_end = case
          when p_status in ('paused', 'cancelled') and v_subscription.status in ('paused', 'cancelled')
            then coalesce(v_subscription.grace_period_end, p_grace_period_end)
          when p_status in ('paused', 'cancelled') then p_grace_period_end
          when p_status = 'authorized' then null
          else grace_period_end
        end,
        provider_modified_at = coalesce(p_provider_modified_at, provider_modified_at)
    where id = p_subscription_id;

    if p_make_current then
      update public.businesses
      set current_subscription_id = p_subscription_id
      where id = p_business_id
        and current_subscription_id is not distinct from p_expected_current_subscription_id;

      if not found then
        raise exception 'CURRENT_SUBSCRIPTION_CONFLICT';
      end if;
    end if;
  end if;

  v_is_current := (
    case when v_applied and p_make_current then p_subscription_id else v_business.current_subscription_id end
  ) = p_subscription_id;

  if v_is_current then
    select s.grace_period_end into v_effective_grace
    from public.subscriptions s
    where s.id = p_subscription_id;
  end if;

  return query
  select p_subscription_id,
         p_business_id,
         (select s.status from public.subscriptions s where s.id = p_subscription_id),
         v_subscription.status,
         v_applied,
         v_is_current,
         v_effective_grace;
end;
$$;

revoke all on function public.apply_subscription_snapshot(
  uuid, uuid, text, public.subscription_status, timestamptz, timestamptz,
  timestamptz, boolean, uuid, timestamptz
) from public, anon, authenticated;

grant execute on function public.apply_subscription_snapshot(
  uuid, uuid, text, public.subscription_status, timestamptz, timestamptz,
  timestamptz, boolean, uuid, timestamptz
) to service_role;

-- 2. A new checkout row carries no plan.
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
    status
  )
  values (
    v_attempt.business_id,
    p_mp_preapproval_id,
    p_status
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

-- 3. The reconciliation links without a plan and no longer promotes the negócio.
create or replace function public.reconcile_billing_attempt_subscription(
  p_attempt_id uuid,
  p_mp_preapproval_id text,
  p_status public.subscription_status,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_grace_period_end timestamptz default null,
  p_claim_token uuid default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
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
    insert into public.subscriptions(business_id, mp_preapproval_id, status,
      current_period_start, current_period_end, grace_period_end)
      values (a.business_id, p_mp_preapproval_id, p_status,
        p_current_period_start, p_current_period_end, p_grace_period_end) returning * into s;
    update public.businesses set current_subscription_id = s.id where id = b.id
      and current_subscription_id is not distinct from a.expected_subscription_id;
    if not found then raise exception 'CURRENT_SUBSCRIPTION_CONFLICT'; end if;
  end if;
  update public.billing_attempts set status = 'linked', provider_preapproval_id = p_mp_preapproval_id,
    resolved_at = now(), updated_at = now() where id = a.id and status in ('unknown', 'ambiguous');
  if not found then raise exception 'CLAIM_LOST'; end if;
  return s;
end; $$;

-- 4. Nothing left to protect.
drop trigger if exists protect_business_plan on public.businesses;
drop function if exists public.protect_business_plan();

-- 5. The end of the carência removes the access by itself (FR-012): no cron
--    rebaixa the negócio any more.
do $$
begin
  if to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where jobname = 'subscription-grace-downgrade') then
    perform cron.unschedule('subscription-grace-downgrade');
  end if;
end;
$$;

drop function if exists public.downgrade_expired_subscriptions();

-- 6. The columns and the enum.
alter table public.subscriptions drop column plan;
alter table public.businesses drop column plan;
drop type public.business_plan;

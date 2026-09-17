-- Fase 6.1: fencing for reconciliation. No destructive constraints are added.
-- Remove the unfenced six-argument overload created in Fase 6; otherwise old
-- callers could bypass fencing by resolving that signature.
drop function if exists public.reconcile_billing_attempt_subscription(
  uuid, text, public.subscription_status, timestamptz, timestamptz, timestamptz
);

create or replace function public.mark_billing_attempt_reconciliation(
  p_attempt_id uuid, p_claim_token uuid, p_expected_status public.billing_attempt_status,
  p_new_status public.billing_attempt_status, p_provider_preapproval_id text default null
) returns public.billing_attempts
language plpgsql security definer set search_path = ''
as $$
declare v_attempt public.billing_attempts;
begin
  if p_expected_status not in ('reserved', 'creating', 'unknown', 'ambiguous')
     or p_new_status not in ('unknown', 'ambiguous') then
    raise exception 'INVALID_RECONCILIATION_TRANSITION';
  end if;
  if not exists (select 1 from public.billing_reconciliation_claims
    where resource_key = 'billing-attempt/' || p_attempt_id::text
      and claim_token = p_claim_token and claimed_until > now()) then raise exception 'CLAIM_LOST'; end if;
  update public.billing_attempts set status = p_new_status,
    provider_preapproval_id = coalesce(p_provider_preapproval_id, provider_preapproval_id), updated_at = now()
    where id = p_attempt_id and status = p_expected_status returning * into v_attempt;
  if v_attempt.id is null then raise exception 'CLAIM_LOST'; end if;
  return v_attempt;
end; $$;

create or replace function public.reconcile_billing_attempt_subscription(
  p_attempt_id uuid, p_mp_preapproval_id text, p_status public.subscription_status,
  p_current_period_start timestamptz default null, p_current_period_end timestamptz default null,
  p_grace_period_end timestamptz default null, p_claim_token uuid default null
) returns public.subscriptions
language plpgsql security definer set search_path = ''
as $$
declare a public.billing_attempts; b public.businesses; s public.subscriptions; v_count integer;
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
    if b.current_subscription_id is not null and
       (a.expected_subscription_id is null or b.current_subscription_id <> a.expected_subscription_id) then
      raise exception 'current subscription changed during reconciliation'; end if;
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

revoke all on function public.mark_billing_attempt_reconciliation(uuid, uuid, public.billing_attempt_status, public.billing_attempt_status, text) from public, anon, authenticated;
grant execute on function public.mark_billing_attempt_reconciliation(uuid, uuid, public.billing_attempt_status, public.billing_attempt_status, text) to service_role;
revoke all on function public.reconcile_billing_attempt_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.reconcile_billing_attempt_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, timestamptz, uuid) to service_role;

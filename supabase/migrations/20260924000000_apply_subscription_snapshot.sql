-- Billing phase 2: atomically apply the provider's current subscription
-- snapshot. This function does not infer webhook ordering. The caller must
-- first fetch the current preapproval from Mercado Pago and pass that snapshot
-- here.

create or replace function public.apply_subscription_snapshot(
  p_business_id uuid,
  p_subscription_id uuid,
  p_mp_preapproval_id text,
  p_status public.subscription_status,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_grace_period_end timestamptz default null,
  p_make_current boolean default false,
  p_expected_current_subscription_id uuid default null
)
returns table (
  subscription_id uuid,
  business_id uuid,
  subscription_status public.subscription_status,
  is_current boolean,
  effective_plan public.business_plan,
  effective_grace_period_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_subscription public.subscriptions;
  v_is_current boolean;
  v_effective_plan public.business_plan;
  v_effective_grace timestamptz;
begin
  -- Lock the business first. This serializes snapshot application, current
  -- subscription promotion, and later downgrade/reconciliation operations.
  select * into v_business
  from public.businesses
  where id = p_business_id
  for update;

  if v_business is null then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  -- A caller may promote a subscription only with an explicit compare-and-
  -- swap expectation. It cannot silently replace a different current row.
  if p_make_current
     and v_business.current_subscription_id is distinct from p_expected_current_subscription_id
  then
    raise exception 'CURRENT_SUBSCRIPTION_CONFLICT';
  end if;

  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
    and business_id = p_business_id
    and mp_preapproval_id = p_mp_preapproval_id
  for update;

  if v_subscription is null then
    raise exception 'SUBSCRIPTION_NOT_FOUND';
  end if;

  -- The subscription row is the historical record of the provider snapshot.
  -- It is updated regardless of whether it is current. No provider status is
  -- interpreted as an event transition here.
  update public.subscriptions
  set status = p_status,
      current_period_start = p_current_period_start,
      current_period_end = p_current_period_end,
      grace_period_end = case
        when p_status in ('paused', 'cancelled') then p_grace_period_end
        when p_status = 'authorized' then null
        else grace_period_end
      end
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

  v_is_current := (
    case when p_make_current then p_subscription_id else v_business.current_subscription_id end
  ) = p_subscription_id;

  -- Only the current subscription may affect the effective business plan.
  -- authorized is the existing project's sole Pro-granting state. pending does
  -- not grant Pro. paused/cancelled preserve the existing plan during grace;
  -- the downgrade RPC remains responsible for expiry.
  if v_is_current then
    if p_status = 'authorized' then
      update public.businesses
      set plan = 'pro'
      where id = p_business_id;
    elsif p_status in ('paused', 'cancelled') then
      -- Preserve the current plan while the supplied grace is active. The
      -- downgrade scheduler/reconciliation decides when the grace has expired.
      null;
    elsif p_status = 'pending' then
      -- Pending never grants Pro and must not erase an existing grace window.
      null;
    end if;
  end if;

  select b.plan,
         case
           when v_is_current then coalesce(
             (select s.grace_period_end from public.subscriptions s where s.id = p_subscription_id),
             null
           )
           else null
         end
    into v_effective_plan, v_effective_grace
  from public.businesses b
  where b.id = p_business_id;

  return query
  select p_subscription_id,
         p_business_id,
         p_status,
         v_is_current,
         v_effective_plan,
         v_effective_grace;
end;
$$;

revoke all on function public.apply_subscription_snapshot(
  uuid,
  uuid,
  text,
  public.subscription_status,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  uuid
) from public, anon, authenticated;
grant execute on function public.apply_subscription_snapshot(
  uuid,
  uuid,
  text,
  public.subscription_status,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  uuid
) to service_role;

-- Ordering fence for apply_subscription_snapshot (ADR 0008). The webhook and
-- the checkout return read the preapproval from Mercado Pago and write it
-- later; a snapshot read before a change and written after it could overwrite
-- the newer state (e.g. `authorized` over `paused`, clearing the carência).
-- The provider's `last_modified` versions each snapshot: it is stored on the
-- row, and a snapshot older than the stored one is ignored (no-op, no error).
-- A snapshot without a version keeps the previous behaviour.
--
-- The result also says whether the snapshot was applied and the status the row
-- had before it, read under the row lock, so concurrent deliveries of the same
-- `paused` tell the dono only once.

alter table public.subscriptions
  add column if not exists provider_modified_at timestamptz;

comment on column public.subscriptions.provider_modified_at is
  'Mercado Pago last_modified of the last snapshot applied; older snapshots are ignored.';

drop function if exists public.apply_subscription_snapshot(
  uuid,
  uuid,
  text,
  public.subscription_status,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  uuid
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
  v_applied boolean;
  v_is_current boolean;
  v_effective_plan public.business_plan;
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

  if v_applied and v_is_current and p_status = 'authorized' then
    update public.businesses
    set plan = 'pro'
    where id = p_business_id;
  end if;

  select b.plan,
         case
           when v_is_current then
             (select s.grace_period_end from public.subscriptions s where s.id = p_subscription_id)
           else null
         end
    into v_effective_plan, v_effective_grace
  from public.businesses b
  where b.id = p_business_id;

  return query
  select p_subscription_id,
         p_business_id,
         (select s.status from public.subscriptions s where s.id = p_subscription_id),
         v_subscription.status,
         v_applied,
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
  uuid,
  timestamptz
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
  uuid,
  timestamptz
) to service_role;

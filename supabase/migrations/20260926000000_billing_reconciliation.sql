-- Fase 6: coordination and durable reconciliation of ambiguous billing work.
-- Claims are short leases: no database lock is held while calling Mercado Pago.
create table if not exists public.billing_reconciliation_claims (
  resource_key text primary key,
  claim_token uuid not null,
  claimed_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.billing_reconciliation_claims enable row level security;
revoke all on public.billing_reconciliation_claims from public, anon, authenticated;
grant select, insert, update, delete on public.billing_reconciliation_claims to service_role;

create or replace function public.claim_billing_reconciliation(
  p_resource_key text,
  p_claim_token uuid,
  p_lease_seconds integer default 300
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_claimed boolean;
begin
  if p_resource_key is null or p_resource_key = '' or p_lease_seconds <= 0 then
    raise exception 'invalid reconciliation claim';
  end if;
  insert into public.billing_reconciliation_claims(resource_key, claim_token, claimed_until)
  values (p_resource_key, p_claim_token, now() + make_interval(secs => p_lease_seconds))
  on conflict (resource_key) do update
    set claim_token = excluded.claim_token,
        claimed_until = excluded.claimed_until,
        updated_at = now()
    where public.billing_reconciliation_claims.claimed_until <= now()
       or public.billing_reconciliation_claims.claim_token = p_claim_token;
  select exists (
    select 1 from public.billing_reconciliation_claims c
    where c.resource_key = p_resource_key and c.claim_token = p_claim_token
  ) into v_claimed;
  return v_claimed;
end;
$$;

create or replace function public.release_billing_reconciliation(
  p_resource_key text,
  p_claim_token uuid
) returns boolean
language sql security definer set search_path = ''
as $$
  delete from public.billing_reconciliation_claims
  where resource_key = p_resource_key and claim_token = p_claim_token
  returning true;
$$;

revoke all on function public.claim_billing_reconciliation(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_billing_reconciliation(text, uuid, integer) to service_role;
revoke all on function public.release_billing_reconciliation(text, uuid) from public, anon, authenticated;
grant execute on function public.release_billing_reconciliation(text, uuid) to service_role;

-- Applies a provider snapshot and links an attempt in one transaction. It is
-- intentionally restricted to reconciliation states; normal creation uses the
-- phase-4 RPCs. The business row lock is the serialization point.
create or replace function public.reconcile_billing_attempt_subscription(
  p_attempt_id uuid,
  p_mp_preapproval_id text,
  p_status public.subscription_status,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_grace_period_end timestamptz default null
) returns public.subscriptions
language plpgsql security definer set search_path = ''
as $$
declare
  a public.billing_attempts;
  b public.businesses;
  s public.subscriptions;
begin
  select * into a from public.billing_attempts where id = p_attempt_id for update;
  if not found then raise exception 'billing attempt not found'; end if;
  if a.status not in ('unknown', 'ambiguous') then
    if a.status = 'linked' and a.provider_preapproval_id = p_mp_preapproval_id then
      select * into s from public.subscriptions where mp_preapproval_id = p_mp_preapproval_id;
      return s;
    end if;
    raise exception 'billing attempt is not reconcilable';
  end if;
  if a.provider_preapproval_id is not null and a.provider_preapproval_id <> p_mp_preapproval_id then
    raise exception 'provider preapproval conflicts with attempt';
  end if;

  select * into b from public.businesses where id = a.business_id for update;
  if not found then raise exception 'business not found'; end if;
  select * into s from public.subscriptions where mp_preapproval_id = p_mp_preapproval_id for update;
  if found and s.business_id <> a.business_id then
    raise exception 'provider preapproval belongs to another business';
  end if;

  if found and b.current_subscription_id is distinct from s.id
     and ((a.expected_subscription_id is null and b.current_subscription_id is not null)
       or (a.expected_subscription_id is not null
         and b.current_subscription_id is distinct from a.expected_subscription_id)) then
    raise exception 'current subscription changed during reconciliation';
  end if;

  if not found then
    if b.current_subscription_id is not null
       and (a.expected_subscription_id is null or b.current_subscription_id <> a.expected_subscription_id) then
      raise exception 'current subscription changed during reconciliation';
    end if;
    insert into public.subscriptions(business_id, mp_preapproval_id, plan, status,
      current_period_start, current_period_end, grace_period_end)
    values (a.business_id, p_mp_preapproval_id, 'pro', p_status,
      p_current_period_start, p_current_period_end, p_grace_period_end)
    returning * into s;
    update public.businesses set current_subscription_id = s.id where id = b.id;
  else
    update public.subscriptions set status = p_status,
      current_period_start = p_current_period_start,
      current_period_end = p_current_period_end,
      grace_period_end = p_grace_period_end
    where id = s.id returning * into s;
    if b.current_subscription_id is null then
      update public.businesses set current_subscription_id = s.id where id = b.id;
    end if;
  end if;

  if (select current_subscription_id from public.businesses where id = b.id) = s.id
     and p_status = 'authorized' then
    update public.businesses set plan = 'pro' where id = b.id;
  end if;
  update public.billing_attempts set status = 'linked', provider_preapproval_id = p_mp_preapproval_id,
    resolved_at = now(), updated_at = now() where id = a.id;
  return s;
end;
$$;

revoke all on function public.reconcile_billing_attempt_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_billing_attempt_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, timestamptz) to service_role;

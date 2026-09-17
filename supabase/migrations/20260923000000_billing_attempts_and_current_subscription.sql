-- Billing phase 1: durable concurrency primitives only.
--
-- This migration intentionally does not change webhook processing, plan
-- application, upgrade actions, retry actions, or scheduler behavior. It adds
-- only the state needed for later phases to coordinate those operations.

-- A business may have many historical subscriptions, but at most one row is
-- the effective/current subscription. The column is nullable during the
-- backfill phase so existing data is never silently assigned a winner.
alter table public.businesses
  add column if not exists current_subscription_id uuid;

-- The foreign key is added after subscriptions already exists. It is nullable
-- by design: ambiguous legacy businesses must be reported before a later phase
-- makes the relationship mandatory.
do $$
begin
  alter table public.businesses
    add constraint businesses_current_subscription_id_fkey
    foreign key (current_subscription_id)
    references public.subscriptions (id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_businesses_current_subscription
  on public.businesses (current_subscription_id)
  where current_subscription_id is not null;

do $$
begin
  create type public.billing_attempt_kind as enum ('initial', 'retry');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_attempt_status as enum (
    'reserved',
    'creating',
    'unknown',
    'linked',
    'failed',
    'ambiguous'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.billing_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.billing_attempt_kind not null,
  status public.billing_attempt_status not null default 'reserved',
  idempotency_key text not null,
  expected_subscription_id uuid references public.subscriptions (id) on delete set null,
  provider_preapproval_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz,
  constraint billing_attempts_idempotency_key_unique unique (idempotency_key)
);

create index if not exists idx_billing_attempts_business
  on public.billing_attempts (business_id, created_at desc);

create index if not exists idx_billing_attempts_reconciliation
  on public.billing_attempts (status, updated_at)
  where status in ('reserved', 'creating', 'unknown', 'ambiguous');

-- Only one logical billing operation may be active for a business. UNKNOWN is
-- deliberately active: a lost provider response must be reconciled before a
-- new external preapproval is attempted.
create unique index if not exists billing_attempts_one_active_per_business
  on public.billing_attempts (business_id)
  where status in ('reserved', 'creating', 'unknown', 'ambiguous');

drop trigger if exists set_updated_at_billing_attempts on public.billing_attempts;
create trigger set_updated_at_billing_attempts
  before update on public.billing_attempts
  for each row execute function public.set_updated_at();

alter table public.billing_attempts enable row level security;
revoke all on public.billing_attempts from public, anon, authenticated;
grant select, insert, update on public.billing_attempts to service_role;

-- Atomically claims the single active billing operation for a business. The
-- function returns the existing active attempt when another caller already
-- won the race; it never creates a second logical attempt.
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
  v_key text := coalesce(nullif(p_idempotency_key, ''), public.gen_random_uuid()::text);
begin
  perform 1
  from public.businesses
  where id = p_business_id
  for update;

  if not found then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  -- Reusing the same business idempotency key returns the original attempt,
  -- including a resolved one, instead of attempting a second insert.
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
    p_expected_subscription_id,
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

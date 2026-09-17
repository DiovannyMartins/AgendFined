-- Fix the schema qualification for pgcrypto's UUID generator.

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
  v_key text := coalesce(nullif(p_idempotency_key, ''), extensions.gen_random_uuid()::text);
begin
  perform 1
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

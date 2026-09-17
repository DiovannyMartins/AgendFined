-- A retry can reserve an attempt before its compare-and-swap validation.
-- If that validation fails, the application marks the reservation failed so
-- it cannot permanently block subsequent checkout attempts.

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
    and status in ('reserved', 'creating')
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

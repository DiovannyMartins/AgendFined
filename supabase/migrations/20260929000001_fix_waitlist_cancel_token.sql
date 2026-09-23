-- Keep waitlist conversion compatible with the private cancellation capability.
-- The application generates the raw token and only passes its SHA-256 digest.

drop function if exists public.convert_waitlist_entry(uuid);

create function public.convert_waitlist_entry(
  p_entry_id uuid,
  p_cancel_token_hash text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
  v_booking public.bookings;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CANCEL_TOKEN_HASH';
  end if;

  select * into v_entry
  from public.waitlist_entries
  where id = p_entry_id;

  if v_entry is null then
    raise exception 'WAITLIST_ENTRY_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.businesses b
    where b.id = v_entry.business_id
      and b.owner_id = auth.uid()
  ) then
    raise exception 'WAITLIST_NOT_OWNER';
  end if;

  if not exists (
    select 1 from public.businesses b
    where b.id = v_entry.business_id
      and b.plan = 'pro'
  ) then
    raise exception 'WAITLIST_PRO_REQUIRED';
  end if;

  if v_entry.status = 'converted' then
    raise exception 'WAITLIST_ALREADY_CONVERTED';
  end if;
  if v_entry.status = 'cancelled' then
    raise exception 'WAITLIST_CANCELLED';
  end if;
  if v_entry.start_at <= now() then
    raise exception 'WAITLIST_PAST_SLOT';
  end if;

  select * into v_booking
  from public.create_booking(
    p_business_id := v_entry.business_id,
    p_service_id := v_entry.service_id,
    p_start_at := v_entry.start_at,
    p_customer_name := v_entry.customer_name,
    p_customer_phone := v_entry.customer_phone,
    p_cancel_token_hash := p_cancel_token_hash,
    p_customer_email := v_entry.customer_email
  );

  update public.waitlist_entries
  set status = 'converted'
  where id = p_entry_id;

  return v_booking;
end;
$$;

revoke all on function public.convert_waitlist_entry(uuid, text) from public, anon, service_role;
grant execute on function public.convert_waitlist_entry(uuid, text) to authenticated;

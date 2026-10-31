-- O GRANT por coluna em bookings (20261027000000) e em waitlist_entries
-- (20261031010000) tira cancel_token_hash e reminder_claim_token do que o dono
-- lê, mas não cobre o retorno de função: as RPCs security definer do dono
-- devolviam a linha inteira, e quem as chamasse direto pelo PostgREST recebia
-- o digest do token do cliente (ADR 0005) e o claim do worker de lembretes.
--
-- Agora elas devolvem um tipo composto com só as colunas do GRANT, a mesma
-- allowlist de retorno explícito das RPCs públicas (ADR 0006). Uma coluna nova
-- em bookings ou waitlist_entries precisa entrar no GRANT e aqui para o dono
-- enxergá-la. Parâmetros, locks, mensagens de erro e invariantes não mudam;
-- os corpos abaixo são os de 20261024020000, 20261025000000 e 20261027000000,
-- trocando só o RETURN. Mudar o tipo de retorno exige DROP + CREATE, então os
-- grants são refeitos.

create type public.owner_booking as (
  id uuid,
  business_id uuid,
  service_id uuid,
  customer_id uuid,
  customer_name_snapshot text,
  customer_phone_snapshot text,
  customer_email_snapshot text,
  service_name_snapshot text,
  duration_minutes_snapshot smallint,
  price_cents_snapshot integer,
  start_at timestamptz,
  end_at timestamptz,
  status public.booking_status,
  public_code text,
  customer_note text,
  cancel_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  reminder_sent_at timestamptz,
  cancel_reason_category text,
  customer_note_category text,
  customer_note_requires_follow_up boolean,
  reminder_claimed_at timestamptz,
  cancelled_by text,
  rescheduled_at timestamptz
);

comment on type public.owner_booking is
  'A reserva como o dono a lê: as colunas do GRANT de bookings, sem cancel_token_hash nem reminder_claim_token.';

create type public.owner_waitlist_entry as (
  id uuid,
  business_id uuid,
  service_id uuid,
  start_at timestamptz,
  customer_name text,
  customer_phone text,
  customer_email text,
  status text,
  created_at timestamptz
);

comment on type public.owner_waitlist_entry is
  'A entrada da lista de espera como o dono a lê: as colunas do GRANT de waitlist_entries, sem cancel_token_hash.';

create function private.owner_booking(p_booking public.bookings)
returns public.owner_booking
language sql
immutable
set search_path = ''
as $$
  select
    p_booking.id,
    p_booking.business_id,
    p_booking.service_id,
    p_booking.customer_id,
    p_booking.customer_name_snapshot,
    p_booking.customer_phone_snapshot,
    p_booking.customer_email_snapshot,
    p_booking.service_name_snapshot,
    p_booking.duration_minutes_snapshot,
    p_booking.price_cents_snapshot,
    p_booking.start_at,
    p_booking.end_at,
    p_booking.status,
    p_booking.public_code,
    p_booking.customer_note,
    p_booking.cancel_reason,
    p_booking.created_at,
    p_booking.updated_at,
    p_booking.reminder_sent_at,
    p_booking.cancel_reason_category,
    p_booking.customer_note_category,
    p_booking.customer_note_requires_follow_up,
    p_booking.reminder_claimed_at,
    p_booking.cancelled_by,
    p_booking.rescheduled_at
$$;

revoke all on function private.owner_booking(public.bookings)
  from public, anon, authenticated, service_role;

create function private.owner_waitlist_entry(p_entry public.waitlist_entries)
returns public.owner_waitlist_entry
language sql
immutable
set search_path = ''
as $$
  select
    p_entry.id,
    p_entry.business_id,
    p_entry.service_id,
    p_entry.start_at,
    p_entry.customer_name,
    p_entry.customer_phone,
    p_entry.customer_email,
    p_entry.status,
    p_entry.created_at
$$;

revoke all on function private.owner_waitlist_entry(public.waitlist_entries)
  from public, anon, authenticated, service_role;

-- 1. Reserva pelo dono (#193).
drop function public.create_owner_booking(uuid, timestamptz, text, text, text, text, text);

create function public.create_owner_booking(
  p_service_id uuid,
  p_start_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_cancel_token_hash text,
  p_customer_email text default null,
  p_customer_note text default null
)
returns public.owner_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_service public.services;
  v_customer public.customers;
  v_booking public.bookings;
  v_plan_window_days integer;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CANCEL_TOKEN_HASH';
  end if;

  if not private.mfa_aal_allowed() then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  -- Same row lock as create_booking: serializes the customer upsert below.
  select * into v_business
  from public.businesses
  where owner_id = (select auth.uid())
  for update;

  if v_business is null then raise exception 'BUSINESS_NOT_FOUND'; end if;

  if p_start_at <= now() then
    raise exception 'BOOKING_IN_PAST';
  end if;
  -- Computed apart: PL/pgSQL ends an IF condition at the first THEN, the CASE's.
  v_plan_window_days := case when v_business.plan = 'pro' then 365 else 90 end;
  if (p_start_at at time zone v_business.timezone)::date >
     (now() at time zone v_business.timezone)::date + v_plan_window_days then
    raise exception 'BOOKING_OUTSIDE_PLAN_WINDOW';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and business_id = v_business.id
  for update;

  if v_service is null then raise exception 'SERVICE_NOT_FOUND'; end if;
  if not v_service.is_active then raise exception 'SERVICE_INACTIVE'; end if;

  -- As in create_booking, an existing customer keeps its identity and contact;
  -- the details typed now live in this reserva's snapshot.
  insert into public.customers (business_id, name, phone, email)
  values (v_business.id, p_customer_name, p_customer_phone, p_customer_email)
  on conflict (business_id, phone) do nothing
  returning * into v_customer;

  if v_customer.id is null then
    select * into strict v_customer
    from public.customers
    where business_id = v_business.id and phone = p_customer_phone;
  end if;

  insert into public.bookings (
    business_id, service_id, customer_id, customer_name_snapshot,
    customer_phone_snapshot, customer_email_snapshot, service_name_snapshot,
    duration_minutes_snapshot, price_cents_snapshot, start_at, end_at,
    customer_note, cancel_token_hash
  )
  values (
    v_business.id, v_service.id, v_customer.id, p_customer_name,
    p_customer_phone, p_customer_email, v_service.name,
    v_service.duration_minutes, v_service.price_cents, p_start_at,
    p_start_at + make_interval(mins => v_service.duration_minutes),
    p_customer_note, p_cancel_token_hash
  )
  returning * into v_booking;

  return private.owner_booking(v_booking);
end;
$$;

revoke all on function public.create_owner_booking(uuid, timestamptz, text, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.create_owner_booking(uuid, timestamptz, text, text, text, text, text)
  to authenticated;

-- 2. Remarcação pelo dono (#194, ADR 0010).
drop function public.reschedule_owner_booking(uuid, timestamptz);

create function public.reschedule_owner_booking(
  p_booking_id uuid,
  p_start_at timestamptz
)
returns public.owner_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_booking public.bookings;
  v_plan_window_days integer;
begin
  if not private.mfa_aal_allowed() then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  -- Same row lock as create_owner_booking.
  select * into v_business
  from public.businesses
  where owner_id = (select auth.uid())
  for update;

  if v_business is null then raise exception 'BUSINESS_NOT_FOUND'; end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
    and business_id = v_business.id
  for update;

  if v_booking is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'BOOKING_NOT_CONFIRMED'; end if;
  if v_booking.start_at <= now() then raise exception 'BOOKING_ALREADY_STARTED'; end if;

  if p_start_at <= now() then
    raise exception 'BOOKING_IN_PAST';
  end if;
  if p_start_at = v_booking.start_at then
    raise exception 'BOOKING_SAME_START';
  end if;
  -- Computed apart: PL/pgSQL ends an IF condition at the first THEN, the CASE's.
  v_plan_window_days := case when v_business.plan = 'pro' then 365 else 90 end;
  if (p_start_at at time zone v_business.timezone)::date >
     (now() at time zone v_business.timezone)::date + v_plan_window_days then
    raise exception 'BOOKING_OUTSIDE_PLAN_WINDOW';
  end if;

  return private.owner_booking(
    private.apply_booking_reschedule(v_booking, p_start_at, 'business')
  );
end;
$$;

revoke all on function public.reschedule_owner_booking(uuid, timestamptz)
  from public, anon, service_role;
grant execute on function public.reschedule_owner_booking(uuid, timestamptz)
  to authenticated;

-- 3. Lista de espera: a entrada é lida e travada só se for do dono, então uma
-- entrada inexistente e uma de outro negócio dão o mesmo erro. Com a linha
-- travada, um cancelamento concorrente por cancel_waitlist_entry_by_token
-- (que também trava a linha) espera, e o status é rechecado depois do lock.
-- O UPDATE final repete o filtro de status como cinto de segurança.
drop function public.notify_waitlist_entry(uuid);

create function public.notify_waitlist_entry(p_entry_id uuid)
returns public.owner_waitlist_entry
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
begin
  if not private.mfa_aal_allowed() then
    raise exception 'WAITLIST_NOT_OWNER';
  end if;

  select e.* into v_entry
  from public.waitlist_entries e
  where e.id = p_entry_id
    and exists (
      select 1 from public.businesses b
      where b.id = e.business_id and b.owner_id = (select auth.uid())
    )
  for update of e;

  if v_entry is null then
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

  update public.waitlist_entries
  set status = 'notified'
  where id = p_entry_id
    and status in ('pending', 'notified')
  returning * into v_entry;

  if v_entry is null then
    raise exception 'WAITLIST_CANCELLED';
  end if;

  return private.owner_waitlist_entry(v_entry);
end;
$$;

revoke all on function public.notify_waitlist_entry(uuid) from public, anon, service_role;
grant execute on function public.notify_waitlist_entry(uuid) to authenticated;

drop function public.convert_waitlist_entry(uuid, text);

create function public.convert_waitlist_entry(
  p_entry_id uuid,
  p_cancel_token_hash text
)
returns public.owner_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
  v_booking public.bookings;
  v_converted integer;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CANCEL_TOKEN_HASH';
  end if;

  if not private.mfa_aal_allowed() then
    raise exception 'WAITLIST_NOT_OWNER';
  end if;

  select e.* into v_entry
  from public.waitlist_entries e
  where e.id = p_entry_id
    and exists (
      select 1 from public.businesses b
      where b.id = e.business_id and b.owner_id = (select auth.uid())
    )
  for update of e;

  if v_entry is null then
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
  where id = p_entry_id
    and status in ('pending', 'notified');
  get diagnostics v_converted = row_count;

  -- Desfaz a reserva criada acima junto com a transação.
  if v_converted = 0 then
    raise exception 'WAITLIST_CANCELLED';
  end if;

  return private.owner_booking(v_booking);
end;
$$;

revoke all on function public.convert_waitlist_entry(uuid, text) from public, anon, service_role;
grant execute on function public.convert_waitlist_entry(uuid, text) to authenticated;

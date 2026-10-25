-- ===========================================================================
-- #193: o dono cria pelo painel a reserva de um cliente que marcou por
-- WhatsApp, telefone ou no balcão. Até aqui só create_booking (service role,
-- fluxo público) gravava reservas, então o dono abria a própria página pública
-- e preenchia como se fosse o cliente: e-mail obrigatório, consentimento em
-- nome do cliente, antecedência e janela do cliente e o limite por IP.
--
-- create_owner_booking é a variante autenticada do dono, no mesmo contrato:
--   * só o dono do negócio (auth.uid() = owner_id) chama, com o mesmo nível de
--     MFA que as políticas RLS exigem (private.mfa_aal_allowed);
--   * snapshot do serviço (ADR 0002), digest do token de cancelamento
--     (ADR 0005), cliente preservado pelo telefone como no fluxo público;
--   * bloqueios e sobreposição continuam no banco: o trigger
--     prevent_booking_block_overlap (BOOKING_BLOCK_OVERLAP) e a exclusion
--     constraint bookings_no_overlap (23P01, ADR 0003);
--   * antecedência (min_notice_minutes) e a janela configurada
--     (booking_window_days) são regras para o cliente e não valem para o dono.
--     O limite de janela do plano (90 dias no Grátis, 365 no PROFISSIONAL)
--     continua valendo, e a reserva precisa começar no futuro;
--   * a disponibilidade (faixas) não é checada aqui: o encaixe fora das faixas
--     é decisão do dono, confirmada na Server Action.
--
-- Um negócio inativo não tem página pública, mas a agenda continua do dono,
-- então is_active não é exigido.
-- ===========================================================================
create or replace function public.create_owner_booking(
  p_service_id uuid,
  p_start_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_cancel_token_hash text,
  p_customer_email text default null,
  p_customer_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_service public.services;
  v_customer public.customers;
  v_booking public.bookings;
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
  if (p_start_at at time zone v_business.timezone)::date >
     (now() at time zone v_business.timezone)::date
       + case when v_business.plan = 'pro' then 365 else 90 end then
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

  return v_booking;
end;
$$;

revoke all on function public.create_owner_booking(uuid, timestamptz, text, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.create_owner_booking(uuid, timestamptz, text, text, text, text, text)
  to authenticated;

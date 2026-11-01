-- Issue #261, fase 3 (ADR 0013): o acesso vale também para o dono, e a janela
-- passa a ser sempre a do plano único.
--
--   * Janela: com um plano só, o limite é sempre 365 dias (antes, plan = 'pro'
--     dava 365 e o resto 90). businesses.plan continua existindo até a fase 4,
--     mas nenhuma RPC daqui o usa mais para janela nem para gate.
--   * Operações do dono num negócio sem acesso (business_has_access() falso)
--     são recusadas no banco: criar, editar, remarcar e converter reservas,
--     avisar a lista de espera, mexer em serviços, disponibilidade, bloqueios
--     e configurações do negócio. As RPCs levantam BUSINESS_SUSPENDED; as
--     policies de escrita negam a linha.
--   * Continua aberto sem acesso: ler reservas, clientes, histórico e
--     assinaturas; cancelar reservas (dono e cliente por token); sair da lista
--     de espera por token; criar e excluir o negócio e o perfil (conta, MFA).
--   * Automações: get_due_booking_reminders e get_waitlist_for_slot ignoram
--     negócios sem acesso.
--   * get_public_booking_page troca offers_waitlist por accepts_bookings: a
--     página pública suspensa continua no ar, sem slots e sem lista de espera.

-- ===========================================================================
-- 1. RPCs públicas: janela de 365 dias
-- ===========================================================================
-- Mesmo corpo de 20261031080000; só a janela.
create or replace function public.create_booking(
  p_business_id uuid,
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
  v_effective_window_days integer;
  v_last_bookable_date date;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CANCEL_TOKEN_HASH';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id
  for update;

  if v_business is null then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if not v_business.is_active then raise exception 'BUSINESS_INACTIVE'; end if;
  if not public.business_has_access(v_business.id) then raise exception 'BUSINESS_SUSPENDED'; end if;

  v_effective_window_days := least(v_business.booking_window_days::integer, 365);
  v_last_bookable_date :=
    (now() at time zone v_business.timezone)::date + v_effective_window_days;

  if (p_start_at at time zone v_business.timezone)::date > v_last_bookable_date then
    raise exception 'BOOKING_OUTSIDE_PLAN_WINDOW';
  end if;
  if p_start_at < now() + make_interval(mins => v_business.min_notice_minutes) then
    raise exception 'BOOKING_BEFORE_MIN_NOTICE';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and business_id = p_business_id
  for update;

  if v_service is null then raise exception 'SERVICE_NOT_FOUND'; end if;
  if not v_service.is_active then raise exception 'SERVICE_INACTIVE'; end if;

  insert into public.customers (business_id, name, phone, email)
  values (p_business_id, p_customer_name, p_customer_phone, p_customer_email)
  on conflict (business_id, phone) do nothing
  returning * into v_customer;

  -- A public phone number is not proof of identity. Preserve the existing
  -- customer and keep unverified submitted details only in this booking's snapshot.
  -- The business row lock above serializes concurrent booking creation.
  if v_customer.id is null then
    select * into strict v_customer
    from public.customers
    where business_id = p_business_id and phone = p_customer_phone;
  end if;

  insert into public.bookings (
    business_id, service_id, customer_id, customer_name_snapshot,
    customer_phone_snapshot, customer_email_snapshot, service_name_snapshot,
    duration_minutes_snapshot, price_cents_snapshot, start_at, end_at,
    customer_note, cancel_token_hash
  )
  values (
    p_business_id, v_service.id, v_customer.id, p_customer_name,
    p_customer_phone, p_customer_email, v_service.name,
    v_service.duration_minutes, v_service.price_cents, p_start_at,
    p_start_at + make_interval(mins => v_service.duration_minutes),
    p_customer_note, p_cancel_token_hash
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

-- Mesmo corpo de 20261031080000; só a janela.
create or replace function public.reschedule_booking_by_public_code(
  p_code text,
  p_cancel_token_hash text,
  p_start_at timestamptz
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
  v_service public.services;
  v_booking public.bookings;
  v_effective_window_days integer;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'RESCHEDULE_REJECTED';
  end if;

  select business_id into v_business_id
  from public.bookings
  where public_code = p_code
    and cancel_token_hash = p_cancel_token_hash;

  if v_business_id is null then raise exception 'RESCHEDULE_REJECTED'; end if;

  -- Business before booking, the order every booking write takes.
  select * into v_business
  from public.businesses
  where id = v_business_id
  for update;

  select * into v_booking
  from public.bookings
  where public_code = p_code
    and cancel_token_hash = p_cancel_token_hash
  for update;

  if v_booking is null or v_booking.status <> 'confirmed' then
    raise exception 'RESCHEDULE_REJECTED';
  end if;
  if v_booking.start_at <= now() then
    raise exception 'BOOKING_ALREADY_STARTED';
  end if;
  if not v_business.is_active then raise exception 'BUSINESS_INACTIVE'; end if;
  if not public.business_has_access(v_business.id) then raise exception 'BUSINESS_SUSPENDED'; end if;

  if p_start_at = v_booking.start_at then
    raise exception 'BOOKING_SAME_START';
  end if;
  if p_start_at < now() + make_interval(mins => v_business.min_notice_minutes) then
    raise exception 'BOOKING_BEFORE_MIN_NOTICE';
  end if;
  v_effective_window_days := least(v_business.booking_window_days::integer, 365);
  if (p_start_at at time zone v_business.timezone)::date >
     (now() at time zone v_business.timezone)::date + v_effective_window_days then
    raise exception 'BOOKING_OUTSIDE_PLAN_WINDOW';
  end if;

  -- The service is locked as in create_booking, which serializes with its
  -- deletion (ADR 0002). A deleted or inactive service is not offered anymore.
  select * into v_service
  from public.services
  where id = v_booking.service_id
    and business_id = v_business.id
  for update;

  if v_service is null or not v_service.is_active then
    raise exception 'SERVICE_INACTIVE';
  end if;

  return private.apply_booking_reschedule(v_booking, p_start_at, 'customer');
end;
$$;

-- ===========================================================================
-- 2. Página pública: accepts_bookings no lugar de offers_waitlist
-- ===========================================================================
-- O tipo de retorno muda, então a função é recriada. accepts_bookings é
-- business_has_access(): sem acesso, a página continua no ar, mas sem slots e
-- sem lista de espera, e mostra o telefone para o cliente falar com o negócio.
-- O motivo (teste, assinatura) não sai do banco.
drop function public.get_public_booking_page(text);

create function public.get_public_booking_page(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  timezone text,
  search_indexing_enabled boolean,
  accepts_bookings boolean,
  booking_window_days integer,
  has_availability boolean,
  phone text,
  services jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select b.*, public.business_has_access(b.id) as accepts_bookings
    from public.businesses b
    where b.slug = p_slug
      and b.is_active = true
  ),
  s as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', sv.id,
          'name', sv.name,
          'description', sv.description,
          'duration_minutes', sv.duration_minutes,
          'price_cents', sv.price_cents
        )
        order by sv.created_at asc
      ),
      '[]'::jsonb
    ) as services
    from public.services sv
    join b on b.id = sv.business_id
    where sv.is_active = true
  ),
  a as (
    select exists (
      select 1
      from public.availability av
      join b on b.id = av.business_id
      where av.is_active = true
    ) as has_availability
  )
  select
    b.id,
    b.name,
    b.slug,
    b.description,
    b.timezone,
    b.search_indexing_enabled,
    b.accepts_bookings,
    least(b.booking_window_days::integer, 365),
    a.has_availability,
    -- Same rule as before: the phone only goes out when the page cannot take
    -- reservas online, now also when the negócio is suspended.
    case
      when not b.accepts_bookings or jsonb_array_length(s.services) = 0 or not a.has_availability
      then b.phone
    end,
    s.services
  from b cross join s cross join a
$$;

revoke all on function public.get_public_booking_page(text) from public;
grant execute on function public.get_public_booking_page(text) to anon, authenticated, service_role;

-- ===========================================================================
-- 3. RPCs do dono recusam negócio sem acesso
-- ===========================================================================
-- Mesmo corpo de 20261031020000; acesso e janela de 365 dias.
create or replace function public.create_owner_booking(
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
  if not public.business_has_access(v_business.id) then raise exception 'BUSINESS_SUSPENDED'; end if;

  if p_start_at <= now() then
    raise exception 'BOOKING_IN_PAST';
  end if;
  if (p_start_at at time zone v_business.timezone)::date >
     (now() at time zone v_business.timezone)::date + 365 then
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

-- Mesmo corpo de 20261031020000; acesso e janela de 365 dias.
create or replace function public.reschedule_owner_booking(
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
  if not public.business_has_access(v_business.id) then raise exception 'BUSINESS_SUSPENDED'; end if;

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
  if (p_start_at at time zone v_business.timezone)::date >
     (now() at time zone v_business.timezone)::date + 365 then
    raise exception 'BOOKING_OUTSIDE_PLAN_WINDOW';
  end if;

  return private.owner_booking(
    private.apply_booking_reschedule(v_booking, p_start_at, 'business')
  );
end;
$$;

-- Mesmo corpo de 20261031020000; BUSINESS_SUSPENDED no lugar de
-- WAITLIST_PRO_REQUIRED.
create or replace function public.convert_waitlist_entry(
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

  if not public.business_has_access(v_entry.business_id) then
    raise exception 'BUSINESS_SUSPENDED';
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

-- Mesmo corpo de 20261031020000; BUSINESS_SUSPENDED no lugar de
-- WAITLIST_PRO_REQUIRED.
create or replace function public.notify_waitlist_entry(p_entry_id uuid)
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

  if not public.business_has_access(v_entry.business_id) then
    raise exception 'BUSINESS_SUSPENDED';
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

-- Excluir serviço passa pelo service role (a Server Action confere o dono), então
-- a recusa fica aqui: sem acesso, nenhum serviço é apagado.
-- Mesmo corpo de 20260928000000; só a checagem de acesso.
create or replace function public.delete_service_if_unused(
  p_business_id uuid,
  p_service_id uuid,
  p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services;
begin
  -- Match create_booking's lock order (business, then service).
  perform 1
  from public.businesses
  where id = p_business_id
  for update;

  if not public.business_has_access(p_business_id) then
    return 'BUSINESS_SUSPENDED';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and business_id = p_business_id
  for update;

  if v_service is null then
    return 'NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.business_id = p_business_id
      and b.service_id = p_service_id
      and b.status = 'confirmed'
      and b.end_at > p_now
  ) then
    return 'HAS_SCHEDULED_BOOKINGS';
  end if;

  delete from public.services
  where id = p_service_id
    and business_id = p_business_id;
  return 'DELETED';
end;
$$;

-- ===========================================================================
-- 4. Automações ignoram negócio sem acesso
-- ===========================================================================
-- Mesmo corpo de 20261025000000; o lembrete passa a valer para todo negócio com
-- acesso (teste ou assinatura), não mais só para plan = 'pro'. A reserva de um
-- negócio sem acesso não é reivindicada: se ele assinar antes do horário, o
-- lembrete ainda sai.
create or replace function public.get_due_booking_reminders(p_lead_minutes integer default 1440)
returns table (
  id uuid,
  business_id uuid,
  business_name text,
  business_slug text,
  business_timezone text,
  business_phone text,
  customer_name_snapshot text,
  customer_email_snapshot text,
  service_name_snapshot text,
  start_at timestamptz,
  public_code text,
  reminder_claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead interval := make_interval(mins => greatest(1, least(p_lead_minutes, 1440)));
begin
  return query
  with candidates as (
    select b.id
    from public.bookings b
    join public.businesses bus on bus.id = b.business_id
    where b.status = 'confirmed'
      and b.reminder_sent_at is null
      and b.customer_email_snapshot is not null
      and b.customer_email_snapshot <> ''
      and b.start_at > now()
      and b.start_at <= now() + v_lead
      and coalesce(b.rescheduled_at, b.created_at) < b.start_at - v_lead
      and (b.reminder_claimed_at is null or b.reminder_claimed_at < now() - interval '15 minutes')
      and public.business_has_access(bus.id)
    order by b.start_at asc
    limit 50
    for update of b skip locked
  ), claimed as (
    update public.bookings b
    set reminder_claimed_at = now(), reminder_claim_token = extensions.gen_random_uuid()
    from candidates c
    where b.id = c.id
    returning b.*
  )
  select
    b.id,
    b.business_id,
    bus.name,
    bus.slug,
    bus.timezone,
    bus.phone,
    b.customer_name_snapshot,
    b.customer_email_snapshot,
    b.service_name_snapshot,
    b.start_at,
    b.public_code,
    b.reminder_claim_token
  from claimed b
  join public.businesses bus on bus.id = b.business_id
  order by b.start_at asc;
end;
$$;

-- Mesmo corpo de 20260914000000; sem acesso, não há a quem avisar.
create or replace function public.get_waitlist_for_slot(
  p_business_id uuid,
  p_start_at timestamptz
)
returns table (
  id uuid,
  business_id uuid,
  service_id uuid,
  start_at timestamptz,
  customer_name text,
  customer_phone text,
  customer_email text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    e.id,
    e.business_id,
    e.service_id,
    e.start_at,
    e.customer_name,
    e.customer_phone,
    e.customer_email,
    e.status,
    e.created_at
  from public.waitlist_entries e
  where e.business_id = p_business_id
    and e.start_at = p_start_at
    and e.status in ('pending', 'notified')
    and public.business_has_access(p_business_id)
  order by e.created_at asc, e.id asc;
end;
$$;

-- ===========================================================================
-- 5. RLS: escritas do dono exigem acesso
-- ===========================================================================
-- Só as policies de escrita mudam; as de leitura ficam como estão. No INSERT e
-- no UPDATE a recusa vem no WITH CHECK (erro 42501, não um "0 linhas"
-- silencioso); no DELETE, que só tem USING, a linha some do alcance.

-- Serviços
alter policy services_insert_own on public.services
  with check (exists (
    select 1 from public.businesses b
    where b.id = services.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));
alter policy services_update_own on public.services
  with check (exists (
    select 1 from public.businesses b
    where b.id = services.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));
alter policy services_delete_own on public.services
  using (exists (
    select 1 from public.businesses b
    where b.id = services.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));

-- Disponibilidade (faixas)
alter policy availability_insert_own on public.availability
  with check (exists (
    select 1 from public.businesses b
    where b.id = availability.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));
alter policy availability_update_own on public.availability
  with check (exists (
    select 1 from public.businesses b
    where b.id = availability.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));
alter policy availability_delete_own on public.availability
  using (exists (
    select 1 from public.businesses b
    where b.id = availability.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));

-- Bloqueios
alter policy blocks_insert_own on public.availability_blocks
  with check (exists (
    select 1 from public.businesses b
    where b.id = availability_blocks.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));
alter policy blocks_update_own on public.availability_blocks
  with check (exists (
    select 1 from public.businesses b
    where b.id = availability_blocks.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));
alter policy blocks_delete_own on public.availability_blocks
  using (exists (
    select 1 from public.businesses b
    where b.id = availability_blocks.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));

-- Clientes: o dono só cria cliente fora das RPCs por aqui.
alter policy customers_insert_own on public.customers
  with check (exists (
    select 1 from public.businesses b
    where b.id = customers.business_id
      and b.owner_id = (select auth.uid())
      and public.business_has_access(b.id)
  ));

-- Reservas: o dono só muda status (concluir, no-show, cancelar) e o motivo do
-- cancelamento (GRANT por coluna). Sem acesso, só o cancelamento passa; a
-- transição em si continua com enforce_booking_status_transition.
alter policy bookings_update_own on public.bookings
  with check (exists (
    select 1 from public.businesses b
    where b.id = bookings.business_id
      and b.owner_id = (select auth.uid())
      and (bookings.status = 'cancelled' or public.business_has_access(b.id))
  ));

-- Configurações do negócio. Criar e excluir o negócio (conta) não mudam.
alter policy businesses_update_own on public.businesses
  with check (owner_id = (select auth.uid()) and public.business_has_access(id));

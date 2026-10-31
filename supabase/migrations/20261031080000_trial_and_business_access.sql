-- Issue #261, fase 2 (ADR 0013): teste grátis, registro de testes concedidos e
-- acesso calculado no banco.
--
--   * businesses.trial_ends_at: fim do teste grátis. Negócio novo elegível nasce
--     com criação + 30 dias; um negócio cujo telefone ou e-mail do dono já está
--     no registro nasce com null (sem teste, suspenso).
--   * public.trial_grants: registro de testes concedidos, só com hashes do
--     telefone e do e-mail normalizados. Não tem FK: sobrevive à exclusão da
--     conta. RLS ligada sem policies e sem grant para anon/authenticated.
--   * public.grant_business_trial(): concessão manual pelo suporte (service role).
--   * public.business_has_access(): assinatura em dia (inclusive em carência,
--     ADR 0008) ou now() < trial_ends_at. Fail-closed: negócio inexistente,
--     sem assinatura e com trial_ends_at null não tem acesso.
--   * create_booking, join_waitlist e reschedule_booking_by_public_code recusam
--     negócio sem acesso (BUSINESS_SUSPENDED). cancel_booking_by_public_code e
--     cancel_waitlist_entry_by_token não mudam: o cliente continua cancelando.
--
-- Compatibilidade até a virada (fase 7): todo negócio que já existe quando esta
-- migration roda recebe trial_ends_at = 'infinity', pelo DEFAULT da coluna nova
-- (preenche as linhas sem UPDATE, então nenhum trigger roda e updated_at não
-- muda). 'infinity' quer dizer "negócio anterior ao plano único": ele mantém o
-- acesso que tem hoje, no Grátis ou no PROFISSIONAL, até a fase 7 trocar esse
-- valor pela virada + 30 dias (Grátis) ou por null (assinantes). Nenhuma linha
-- nova recebe 'infinity': o DEFAULT sai logo depois e o trigger abaixo decide.
-- Assim business_has_access() não precisa de caso especial para null.

-- ===========================================================================
-- 1. businesses.trial_ends_at
-- ===========================================================================
alter table public.businesses
  add column trial_ends_at timestamptz default 'infinity';
alter table public.businesses
  alter column trial_ends_at drop default;

comment on column public.businesses.trial_ends_at is
  'Fim do teste grátis (ADR 0013). null = sem teste. ''infinity'' = negócio anterior ao plano único, até a virada (#261, fase 7).';

-- ===========================================================================
-- 2. Registro de testes concedidos
-- ===========================================================================
create table public.trial_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  phone_hash text,
  email_hash text,
  -- Só para o suporte rastrear a concessão; sem FK, a linha fica depois que
  -- o negócio é apagado junto com a conta.
  business_id uuid,
  source text not null
    constraint trial_grants_source_check check (source in ('signup', 'manual', 'migration')),
  granted_at timestamptz not null default now(),
  constraint trial_grants_identity_check check (phone_hash is not null or email_hash is not null)
);

create index trial_grants_phone_hash_idx on public.trial_grants (phone_hash) where phone_hash is not null;
create index trial_grants_email_hash_idx on public.trial_grants (email_hash) where email_hash is not null;

alter table public.trial_grants enable row level security;
revoke all on table public.trial_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.trial_grants to service_role;

-- Telefone do negócio na forma de brazilianPhoneSchema (DDD + número, sem 55),
-- a mesma de private.normalize_customer_phone. Um telefone antigo que não
-- valida mais cai para só os dígitos, para ainda contar no registro.
create or replace function private.trial_phone_hash(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when v.phone is null or v.phone = '' then null
    else encode(pg_catalog.sha256(convert_to('phone:' || v.phone, 'UTF8')), 'hex')
  end
  from (
    select coalesce(
      private.normalize_customer_phone(p_phone),
      regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    ) as phone
  ) v;
$$;

-- E-mail do dono em minúsculas; no Gmail, a parte local perde os pontos e o
-- +tag, e googlemail.com vira gmail.com.
create or replace function private.trial_email_hash(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when v.email is null or position('@' in v.email) = 0 then null
    else encode(pg_catalog.sha256(convert_to('email:' || (
      case
        when split_part(v.email, '@', 2) in ('gmail.com', 'googlemail.com') then
          replace(split_part(split_part(v.email, '@', 1), '+', 1), '.', '') || '@gmail.com'
        else v.email
      end
    ), 'UTF8')), 'hex')
  end
  from (select lower(btrim(p_email)) as email) v;
$$;

revoke all on function private.trial_phone_hash(text) from public, anon, authenticated, service_role;
revoke all on function private.trial_email_hash(text) from public, anon, authenticated, service_role;

-- Registra o teste do negócio. Os locks serializam cadastros simultâneos com o
-- mesmo telefone ou e-mail (sempre telefone antes de e-mail, então não há
-- ciclo). Devolve false quando o telefone ou o e-mail já usou o teste.
create or replace function private.claim_trial(
  p_business_id uuid,
  p_owner_id uuid,
  p_phone text,
  p_source text,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone_hash text := private.trial_phone_hash(p_phone);
  v_email_hash text;
begin
  select private.trial_email_hash(u.email) into v_email_hash
  from auth.users u
  where u.id = p_owner_id;

  if v_phone_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_phone_hash, 0));
  end if;
  if v_email_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email_hash, 0));
  end if;

  if not p_force and exists (
    select 1
    from public.trial_grants g
    where g.phone_hash = v_phone_hash
       or g.email_hash = v_email_hash
  ) then
    return false;
  end if;

  if v_phone_hash is not null or v_email_hash is not null then
    insert into public.trial_grants (phone_hash, email_hash, business_id, source)
    values (v_phone_hash, v_email_hash, p_business_id, p_source);
  end if;
  return true;
end;
$$;

revoke all on function private.claim_trial(uuid, uuid, text, text, boolean)
  from public, anon, authenticated, service_role;

-- ===========================================================================
-- 3. Teste no cadastro e guarda de trial_ends_at
-- ===========================================================================
-- No INSERT, o banco decide o teste: o valor enviado é ignorado, exceto quando
-- não há sessão de usuário (service role ou SQL direto) e ele veio preenchido,
-- caminho do suporte, da virada e dos testes, que não passa pelo registro.
-- No UPDATE, uma sessão de dono nunca muda trial_ends_at.
create or replace function public.set_business_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null and new.trial_ends_at is not null then
      return new;
    end if;

    new.trial_ends_at := case
      when private.claim_trial(new.id, new.owner_id, new.phone, 'signup')
        then new.created_at + interval '30 days'
      else null
    end;
    return new;
  end if;

  if auth.uid() is not null and new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'TRIAL_CHANGE_SELF_SERVE_DISABLED'
      using errcode = 'P0001',
      hint = 'The trial is set by the database on signup or by support.';
  end if;
  return new;
end;
$$;

revoke all on function public.set_business_trial() from public, anon, authenticated, service_role;

create trigger set_business_trial
  before insert or update of trial_ends_at on public.businesses
  for each row execute function public.set_business_trial();

-- ===========================================================================
-- 4. Concessão manual pelo suporte
-- ===========================================================================
-- Dá um teste novo de p_days dias a partir de agora, mesmo que o telefone ou o
-- e-mail já tenham usado o teste (por exemplo, salão que trocou de dono), e
-- registra a concessão. Só service role.
create or replace function public.grant_business_trial(
  p_business_id uuid,
  p_days integer default 30
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_trial_ends_at timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'INVALID_TRIAL_DAYS';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id
  for update;
  if v_business is null then raise exception 'BUSINESS_NOT_FOUND'; end if;

  perform private.claim_trial(v_business.id, v_business.owner_id, v_business.phone, 'manual', true);

  v_trial_ends_at := now() + make_interval(days => p_days);
  update public.businesses
  set trial_ends_at = v_trial_ends_at
  where id = v_business.id;

  return v_trial_ends_at;
end;
$$;

revoke all on function public.grant_business_trial(uuid, integer) from public, anon, authenticated;
grant execute on function public.grant_business_trial(uuid, integer) to service_role;

-- ===========================================================================
-- 5. business_has_access()
-- ===========================================================================
-- Assinatura em dia é a mesma regra de downgrade_expired_subscriptions: a
-- assinatura atual (current_subscription_id; sem ele, a mais recente) está
-- `authorized`, ou alguma `paused`/`cancelled` ainda tem carência. O fim da
-- carência e o do teste valem no instante exato, sem cron.
create or replace function public.business_has_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select now() < b.trial_ends_at
      or exists (
        select 1
        from public.subscriptions s
        where s.business_id = b.id
          and s.status = 'authorized'
          and s.id = coalesce(
            b.current_subscription_id,
            (
              select s2.id
              from public.subscriptions s2
              where s2.business_id = b.id
              order by s2.created_at desc
              limit 1
            )
          )
      )
      or exists (
        select 1
        from public.subscriptions g
        where g.business_id = b.id
          and g.status in ('paused', 'cancelled')
          and g.grace_period_end > now()
      )
    from public.businesses b
    where b.id = p_business_id
  ), false);
$$;

revoke all on function public.business_has_access(uuid) from public, anon;
grant execute on function public.business_has_access(uuid) to authenticated, service_role;

-- ===========================================================================
-- 6. RPCs públicas recusam negócio sem acesso
-- ===========================================================================
-- Mesmo corpo de 20261014000000; só a checagem de acesso depois de
-- BUSINESS_INACTIVE.
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

  v_effective_window_days := least(
    v_business.booking_window_days::integer,
    case when v_business.plan = 'pro' then 365 else 90 end
  );
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

revoke all on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text, text)
  to service_role;

-- Mesmo corpo de 20261025010000; só a checagem de acesso depois de
-- BUSINESS_INACTIVE.
create or replace function public.join_waitlist(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_cancel_token_hash text default null
)
returns public.waitlist_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_service public.services;
  v_entry public.waitlist_entries;
begin
  if p_cancel_token_hash is not null and p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CANCEL_TOKEN_HASH';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id;
  if v_business is null then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;
  if not v_business.is_active then
    raise exception 'BUSINESS_INACTIVE';
  end if;
  if not public.business_has_access(v_business.id) then
    raise exception 'BUSINESS_SUSPENDED';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id;
  if v_service is null then
    raise exception 'SERVICE_NOT_FOUND';
  end if;
  if v_service.business_id <> p_business_id then
    raise exception 'SERVICE_BUSINESS_MISMATCH';
  end if;
  if not v_service.is_active then
    raise exception 'SERVICE_INACTIVE';
  end if;

  if p_start_at <= now() then
    raise exception 'WAITLIST_PAST_SLOT';
  end if;

  if not exists (
    select 1
    from public.bookings b
    where b.business_id = p_business_id
      and b.status <> 'cancelled'
      and tstzrange(b.start_at, b.end_at, '[)') @> p_start_at
  ) then
    raise exception 'WAITLIST_SLOT_NOT_OCCUPIED';
  end if;

  insert into public.waitlist_entries as w (
    business_id,
    service_id,
    start_at,
    customer_name,
    customer_phone,
    customer_email,
    cancel_token_hash
  )
  values (
    p_business_id,
    p_service_id,
    p_start_at,
    p_customer_name,
    p_customer_phone,
    nullif(p_customer_email, ''),
    p_cancel_token_hash
  )
  on conflict (business_id, service_id, start_at, customer_phone)
  do update set
    customer_name = excluded.customer_name,
    customer_email = case
      when w.status = 'cancelled' then excluded.customer_email
      else w.customer_email
    end,
    status = 'pending',
    cancel_token_hash = case
      when w.status = 'cancelled' then excluded.cancel_token_hash
      else coalesce(excluded.cancel_token_hash, w.cancel_token_hash)
    end
  where w.status = 'cancelled'
    or (
      w.status in ('pending', 'notified')
      and lower(w.customer_email) = lower(excluded.customer_email)
    )
  returning * into v_entry;

  -- A condição do upsert não deixou mexer: devolve a entrada como está (o
  -- conflito já a travou até o fim da transação).
  if v_entry.id is null then
    select * into v_entry
    from public.waitlist_entries
    where business_id = p_business_id
      and service_id = p_service_id
      and start_at = p_start_at
      and customer_phone = p_customer_phone;
  end if;

  return v_entry;
end;
$$;

revoke all on function public.join_waitlist(uuid, uuid, timestamptz, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.join_waitlist(uuid, uuid, timestamptz, text, text, text, text)
  to service_role;

-- Mesmo corpo de 20261025000000; só a checagem de acesso depois de
-- BUSINESS_INACTIVE, que, como ela, só responde a quem tem o token.
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
  v_effective_window_days := least(
    v_business.booking_window_days::integer,
    case when v_business.plan = 'pro' then 365 else 90 end
  );
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

revoke all on function public.reschedule_booking_by_public_code(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reschedule_booking_by_public_code(text, text, timestamptz)
  to service_role;

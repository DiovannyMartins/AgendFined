-- #152 (item 5): o cliente que entra na lista de espera recebe um e-mail com
-- um link privado para sair dela. A saída usa uma capability no molde do
-- token de cancelamento da reserva (ADR 0005):
--
--   * a Server Action gera 32 bytes aleatórios e passa só o digest SHA-256 a
--     `join_waitlist`, que o grava em `waitlist_entries.cancel_token_hash`;
--     o token bruto vai uma única vez no link do e-mail;
--   * ao entrar de novo no mesmo horário (mesma entrada pela deduplicação), o
--     digest é trocado pelo novo: vale o link do e-mail mais recente;
--   * `cancel_waitlist_entry_by_token`, restrita à service role, compara o
--     digest na mesma transação com lock que muda pending/notified -> cancelled.
--     Toda falha responde WAITLIST_CANCELLATION_REJECTED (ADR 0006).
--
-- Entradas anteriores ficam sem digest e não podem sair pelo link.
--
-- Compatível com o deploy: `p_cancel_token_hash` tem default null, então o
-- código anterior (que não envia o digest) segue funcionando entre o push
-- desta migration e o deploy do app. O código novo sempre envia o digest.

alter table public.waitlist_entries
  add column if not exists cancel_token_hash text;

alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_cancel_token_hash_format;

alter table public.waitlist_entries
  add constraint waitlist_entries_cancel_token_hash_format
  check (cancel_token_hash is null or cancel_token_hash ~ '^[0-9a-f]{64}$');

comment on column public.waitlist_entries.cancel_token_hash is
  'SHA-256 do token de saída da lista de espera; o token bruto nunca é armazenado (ADR 0005).';

-- A saída procura a entrada só pelo digest.
create unique index if not exists waitlist_entries_cancel_token_hash_key
  on public.waitlist_entries (cancel_token_hash)
  where cancel_token_hash is not null;

-- ===========================================================================
-- 1. join_waitlist passa a exigir o digest da capability de saída.
-- ===========================================================================
drop function if exists public.join_waitlist(uuid, uuid, timestamptz, text, text, text);

create function public.join_waitlist(
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

  insert into public.waitlist_entries (
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
    customer_email = coalesce(excluded.customer_email, public.waitlist_entries.customer_email),
    status = 'pending',
    cancel_token_hash = coalesce(excluded.cancel_token_hash, public.waitlist_entries.cancel_token_hash)
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.join_waitlist(uuid, uuid, timestamptz, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.join_waitlist(uuid, uuid, timestamptz, text, text, text, text)
  to service_role;

-- ===========================================================================
-- 2. Saída self-service: pending/notified -> cancelled pelo digest.
-- ===========================================================================
create or replace function public.cancel_waitlist_entry_by_token(p_cancel_token_hash text)
returns public.waitlist_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'WAITLIST_CANCELLATION_REJECTED';
  end if;

  select * into v_entry
  from public.waitlist_entries
  where cancel_token_hash = p_cancel_token_hash
  for update;

  if v_entry is null or v_entry.status not in ('pending', 'notified') then
    raise exception 'WAITLIST_CANCELLATION_REJECTED';
  end if;

  update public.waitlist_entries
  set status = 'cancelled'
  where id = v_entry.id
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.cancel_waitlist_entry_by_token(text)
  from public, anon, authenticated;
grant execute on function public.cancel_waitlist_entry_by_token(text)
  to service_role;

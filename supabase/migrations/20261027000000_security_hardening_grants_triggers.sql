-- Hardening de grants e triggers. Nenhum item muda o comportamento visível do
-- app; todos fecham caminhos que hoje só o próprio app deixava de usar.
--
-- O schema net (pg_net) fica de fora: ele e suas funções e tabelas pertencem a
-- supabase_admin, que concedeu USAGE/EXECUTE a anon e authenticated. Uma
-- migration roda como postgres, que não é o concedente, então REVOKE só emite
-- WARNING e não muda nada. O net também não está entre os schemas expostos
-- pelo Data API.

-- 1. completed e no_show registram o que aconteceu no atendimento, então só
-- valem depois do início da reserva. Espelha isTooEarlyFor de
-- lib/bookings/transitions.ts, agora também no banco. A correção entre
-- completed e no_show (#145) já pressupõe um atendimento iniciado.
create or replace function public.enforce_booking_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and not (
       (old.status = 'confirmed' and new.status in ('completed', 'cancelled', 'no_show'))
       or (old.status = 'completed' and new.status = 'no_show')
       or (old.status = 'no_show' and new.status = 'completed')
     ) then
    raise exception 'BOOKING_STATUS_TRANSITION_NOT_ALLOWED'
      using errcode = 'P0001',
      detail = format('%s -> %s', old.status, new.status);
  end if;
  if new.status is distinct from old.status
     and old.status = 'confirmed'
     and new.status in ('completed', 'no_show')
     and new.start_at > now() then
    raise exception 'BOOKING_NOT_STARTED'
      using errcode = 'P0001',
      detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_booking_status_transition() from public, anon, authenticated, service_role;

-- 2. Lista de espera: a entrada é lida e travada só se for do dono, então uma
-- entrada inexistente e uma de outro negócio dão o mesmo erro. Com a linha
-- travada, um cancelamento concorrente por cancel_waitlist_entry_by_token
-- (que também trava a linha) espera, e o status é rechecado depois do lock.
-- O UPDATE final repete o filtro de status como cinto de segurança.
create or replace function public.notify_waitlist_entry(p_entry_id uuid)
returns public.waitlist_entries
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

  return v_entry;
end;
$$;

revoke all on function public.notify_waitlist_entry(uuid) from public, anon, service_role;
grant execute on function public.notify_waitlist_entry(uuid) to authenticated;

create or replace function public.convert_waitlist_entry(
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

  return v_booking;
end;
$$;

revoke all on function public.convert_waitlist_entry(uuid, text) from public, anon, service_role;
grant execute on function public.convert_waitlist_entry(uuid, text) to authenticated;

-- 3. O overload sem claim token não protege contra dois workers de lembrete;
-- a Edge Function booking-reminders já usa só a forma com p_claim_tokens.
drop function if exists public.set_booking_reminders_sent(uuid[]);

-- 4. O cancelamento pelo cliente trava o negócio antes da reserva, a mesma
-- ordem de create_booking, create_owner_booking e das remarcações. A ordem
-- invertida podia gerar deadlock com uma remarcação simultânea do mesmo negócio.
create or replace function public.cancel_booking_by_public_code(
  p_code text,
  p_cancel_token_hash text,
  p_cancel_reason text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_booking public.bookings;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CANCELLATION_REJECTED';
  end if;

  select business_id into v_business_id
  from public.bookings
  where public_code = p_code
    and cancel_token_hash = p_cancel_token_hash;

  if v_business_id is null then
    raise exception 'CANCELLATION_REJECTED';
  end if;

  -- Negócio antes da reserva, a ordem de toda escrita de reserva.
  perform 1
  from public.businesses
  where id = v_business_id
  for update;

  select * into v_booking
  from public.bookings
  where public_code = p_code
    and cancel_token_hash = p_cancel_token_hash
  for update;

  if v_booking is null or v_booking.status <> 'confirmed' then
    raise exception 'CANCELLATION_REJECTED';
  end if;

  if v_booking.start_at <= now() then
    raise exception 'BOOKING_ALREADY_STARTED';
  end if;

  update public.bookings
  set status = 'cancelled',
      cancelled_by = 'customer',
      cancel_reason = nullif(p_cancel_reason, ''),
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.cancel_booking_by_public_code(text, text, text)
  from public, anon, authenticated;
grant execute on function public.cancel_booking_by_public_code(text, text, text)
  to service_role;

-- 5. authenticated fica só com o que as policies de RLS permitem
-- (20261017020000_explicit_data_api_table_grants continua a fonte da verdade
-- para as tabelas; este bloco tira o excedente que o default privileges deu).
-- TRUNCATE ignora RLS, então nunca é do Data API; TRIGGER, REFERENCES e
-- MAINTAIN não têm uso pelo app.
revoke truncate, trigger, references, maintain on table
  public.profiles,
  public.businesses,
  public.services,
  public.availability,
  public.availability_blocks,
  public.customers,
  public.bookings,
  public.booking_reschedules,
  public.waitlist_entries,
  public.subscriptions
from authenticated;

-- Sem policy de UPDATE/DELETE: as escritas passam por RPC ou service_role.
-- Em bookings só DELETE: um REVOKE UPDATE de tabela levaria junto o UPDATE
-- por coluna do dono (status e cancelamento).
revoke update, delete on table public.customers from authenticated;
revoke delete on table public.bookings from authenticated;
revoke insert, update, delete on table
  public.waitlist_entries,
  public.subscriptions
from authenticated;

-- booking_rate_limits não tem policy para authenticated: só as RPCs
-- security definer e o service_role escrevem nela.
revoke all on table public.booking_rate_limits from authenticated;

-- Tabelas futuras criadas por postgres em public não herdam mais esses
-- privilégios para authenticated.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references, maintain on tables from authenticated;

-- 6. reminder_claim_token cerca o worker de lembretes e não é do dono, assim
-- como cancel_token_hash, a capacidade do cliente. O SELECT de bookings passa
-- a ser por coluna; uma coluna nova em bookings precisa entrar aqui para o
-- dashboard enxergá-la. O UPDATE por coluna (status e cancelamento) de
-- 20261015000000_bookings_owner_write_guard fica como está.
revoke select on table public.bookings from authenticated;
grant select (
  id,
  business_id,
  service_id,
  customer_id,
  customer_name_snapshot,
  customer_phone_snapshot,
  customer_email_snapshot,
  service_name_snapshot,
  duration_minutes_snapshot,
  price_cents_snapshot,
  start_at,
  end_at,
  status,
  public_code,
  customer_note,
  cancel_reason,
  created_at,
  updated_at,
  reminder_sent_at,
  cancel_reason_category,
  customer_note_category,
  customer_note_requires_follow_up,
  reminder_claimed_at,
  cancelled_by,
  rescheduled_at
) on table public.bookings to authenticated;

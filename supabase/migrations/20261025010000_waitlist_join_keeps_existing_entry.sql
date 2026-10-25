-- Entrar de novo na lista de espera não toma a entrada de outra pessoa.
--
-- A deduplicação é por horário + telefone, e o telefone não é segredo. Até aqui
-- o upsert de `join_waitlist` trocava nome, e-mail e o digest do link de saída
-- de qualquer entrada existente e a voltava para `pending`. Com isso, quem
-- soubesse o telefone de um cliente passava a receber o aviso de vaga e a
-- confirmação da conversão (com o link privado da reserva), e invalidava o
-- link de saída do cliente.
--
-- Agora, para uma entrada que já existe:
--   * `cancelled`: recomeça como entrada nova (nome, e-mail e digest novos);
--   * `pending`/`notified` com o mesmo e-mail (sem diferenciar maiúsculas):
--     mantém o comportamento do #152, o digest é trocado e vale o link mais
--     recente, que vai para o mesmo endereço;
--   * qualquer outro caso (outro e-mail, sem e-mail, `converted`): nada muda.
--
-- A função devolve sempre a entrada como ficou. A Server Action só manda o
-- e-mail com o link quando o digest devolvido é o que ela gerou, e responde ao
-- cliente com a mesma mensagem em todos os casos.

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

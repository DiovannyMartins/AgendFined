-- Issue #81: o telefone do cliente passou a ser validado e gravado na forma
-- canônica de `customerPhoneSchema` (lib/validation/schemas.ts): só dígitos,
-- DDD + número, 10 dígitos para fixo e 11 para celular, sem o 55. Linhas
-- antigas gravadas como "+55 11 9...", "(11) 9..." etc. não casam mais com a
-- forma nova, então a reserva pública criaria um segundo cliente com o mesmo
-- telefone e a lista de espera deixaria de deduplicar.
--
-- Esta migration normaliza os telefones já gravados em `customers.phone` e
-- `waitlist_entries.customer_phone`. Telefones que não normalizam ficam como
-- estão. `bookings.customer_phone_snapshot` é snapshot da reserva e não é
-- reescrito.
--
-- Conflitos (linhas que passam a ter o mesmo telefone canônico) são resolvidos
-- como as RPCs teriam resolvido se o telefone já fosse canônico:
--   * cliente: `create_booking` preserva o cliente existente (20261014000000).
--     O mais antigo do grupo fica com nome e e-mail intactos, as reservas dos
--     demais passam a apontar para ele e os demais são removidos;
--   * lista de espera: `join_waitlist` reaproveita a entrada existente e
--     sobrescreve nome, e-mail (se informado) e status. A entrada mais antiga
--     do grupo fica (id e posição na fila), com nome, e-mail e status da mais
--     recente, e as demais são removidas.
--
-- `private.normalize_customer_phones()` fica disponível para rodar de novo
-- (`select private.normalize_customer_phones();`) caso linhas em formato
-- antigo sejam gravadas entre esta migration e o deploy do código do #81.

-- ===========================================================================
-- 1. Forma canônica do telefone do cliente. Espelha `customerPhoneSchema`:
--    devolve o telefone canônico ou null quando a validação rejeitaria.
-- ===========================================================================
create or replace function private.normalize_customer_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text;
  v_digits text;
  v_national text;
begin
  if p_phone is null then
    return null;
  end if;

  v_value := regexp_replace(p_phone, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if char_length(v_value) = 0 or char_length(v_value) > 30 then
    return null;
  end if;
  if v_value !~ '^\+?[0-9[:space:]().-]+$' then
    return null;
  end if;

  v_digits := regexp_replace(v_value, '[^0-9]', '', 'g');
  if left(v_value, 1) = '+' and left(v_digits, 2) <> '55' then
    return null;
  end if;

  -- 12-13 dígitos só podem ser 55 + DDD + número; 11 dígitos começando por 55
  -- são um celular do DDD 55, então o código do país sai pelo tamanho.
  v_national := case
    when char_length(v_digits) >= 12 and left(v_digits, 2) = '55' then substr(v_digits, 3)
    else v_digits
  end;

  -- DDD sem zero; celular com 9 dígitos começando por 9; fixo com 8 dígitos
  -- começando por 2 a 5.
  if v_national !~ '^[1-9]{2}(9[0-9]{8}|[2-5][0-9]{7})$' then
    return null;
  end if;

  return v_national;
end;
$$;

revoke all on function private.normalize_customer_phone(text)
  from public, anon, authenticated, service_role;

-- ===========================================================================
-- 2. Normalização dos dados gravados, com resolução de conflitos.
-- ===========================================================================
create or replace function private.normalize_customer_phones()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_bookings_repointed integer;
  v_customers_merged integer;
  v_customers_normalized integer;
  v_waitlist_merged integer;
  v_waitlist_normalized integer;
  v_customers_unnormalized integer;
  v_waitlist_unnormalized integer;
begin
  -- Leituras continuam liberadas; reservas, clientes e entradas novas esperam
  -- o fim da normalização, então nenhum telefone muda no meio dela.
  lock table public.customers, public.bookings, public.waitlist_entries
    in share row exclusive mode;

  -- Clientes: o mais antigo de cada (negócio, telefone canônico) fica.
  with normalized as (
    select id, business_id, created_at, private.normalize_customer_phone(phone) as phone
    from public.customers
  ),
  ranked as (
    select
      id,
      first_value(id) over (partition by business_id, phone order by created_at, id) as keeper_id
    from normalized
    where phone is not null
  )
  update public.bookings b
  set customer_id = r.keeper_id
  from ranked r
  where b.customer_id = r.id
    and r.id <> r.keeper_id;
  get diagnostics v_bookings_repointed = row_count;

  with normalized as (
    select id, business_id, created_at, private.normalize_customer_phone(phone) as phone
    from public.customers
  ),
  ranked as (
    select
      id,
      first_value(id) over (partition by business_id, phone order by created_at, id) as keeper_id
    from normalized
    where phone is not null
  )
  delete from public.customers c
  using ranked r
  where c.id = r.id
    and r.id <> r.keeper_id;
  get diagnostics v_customers_merged = row_count;

  update public.customers
  set phone = private.normalize_customer_phone(phone)
  where private.normalize_customer_phone(phone) is not null
    and phone <> private.normalize_customer_phone(phone);
  get diagnostics v_customers_normalized = row_count;

  -- Lista de espera: a mais antiga de cada (negócio, serviço, início, telefone
  -- canônico) fica, com nome, e-mail e status da mais recente.
  with normalized as (
    select
      id, business_id, service_id, start_at, created_at,
      private.normalize_customer_phone(customer_phone) as phone
    from public.waitlist_entries
  ),
  ranked as (
    select
      id,
      first_value(id) over (
        partition by business_id, service_id, start_at, phone order by created_at, id
      ) as keeper_id,
      first_value(id) over (
        partition by business_id, service_id, start_at, phone order by created_at desc, id desc
      ) as latest_id
    from normalized
    where phone is not null
  )
  update public.waitlist_entries keeper
  set
    customer_name = latest.customer_name,
    customer_email = coalesce(latest.customer_email, keeper.customer_email),
    status = latest.status
  from ranked r
  join public.waitlist_entries latest on latest.id = r.latest_id
  where keeper.id = r.id
    and r.id = r.keeper_id
    and r.keeper_id <> r.latest_id;

  with normalized as (
    select
      id, business_id, service_id, start_at, created_at,
      private.normalize_customer_phone(customer_phone) as phone
    from public.waitlist_entries
  ),
  ranked as (
    select
      id,
      first_value(id) over (
        partition by business_id, service_id, start_at, phone order by created_at, id
      ) as keeper_id
    from normalized
    where phone is not null
  )
  delete from public.waitlist_entries w
  using ranked r
  where w.id = r.id
    and r.id <> r.keeper_id;
  get diagnostics v_waitlist_merged = row_count;

  update public.waitlist_entries
  set customer_phone = private.normalize_customer_phone(customer_phone)
  where private.normalize_customer_phone(customer_phone) is not null
    and customer_phone <> private.normalize_customer_phone(customer_phone);
  get diagnostics v_waitlist_normalized = row_count;

  select count(*) into v_customers_unnormalized
  from public.customers
  where private.normalize_customer_phone(phone) is null;

  select count(*) into v_waitlist_unnormalized
  from public.waitlist_entries
  where private.normalize_customer_phone(customer_phone) is null;

  return jsonb_build_object(
    'customers_normalized', v_customers_normalized,
    'customers_merged', v_customers_merged,
    'bookings_repointed', v_bookings_repointed,
    'customers_unnormalized', v_customers_unnormalized,
    'waitlist_normalized', v_waitlist_normalized,
    'waitlist_merged', v_waitlist_merged,
    'waitlist_unnormalized', v_waitlist_unnormalized
  );
end;
$$;

revoke all on function private.normalize_customer_phones()
  from public, anon, authenticated, service_role;

do $$
begin
  raise notice 'normalize_customer_phones: %', private.normalize_customer_phones();
end;
$$;

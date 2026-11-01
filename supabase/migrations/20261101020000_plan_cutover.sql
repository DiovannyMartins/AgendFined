-- ===========================================================================
-- Virada do plano único (#261, fase 7; spec 007 User Story 5, FR-017, SC-005;
-- ADR 0013).
--
-- Todo negócio anterior ao plano único tem trial_ends_at = 'infinity' desde a
-- fase 2 (20261031080000). Esta migration troca esse valor de uma vez:
--   * sem assinatura atual `authorized` e sem carência vigente (os do antigo
--     Grátis, inclusive quem já assinou e cancelou): virada + 30 dias, um
--     registro em trial_grants (source 'migration', mesmos hashes do cadastro)
--     e um e-mail da virada na fila (public.plan_cutover_notices);
--   * com assinatura atual `authorized` ou carência vigente (ADR 0008): null,
--     sem teste; o acesso vem da assinatura, como em business_has_access().
-- Depois disso nenhuma linha tem 'infinity', e o check
-- businesses_trial_ends_at_finite impede que volte.
--
-- A troca roda em private.apply_plan_cutover(), que só olha 'infinity': rodar
-- de novo não muda nada (idempotente). O trigger set_updated_at_businesses fica
-- desligado durante o UPDATE para não mexer em updated_at (lastModified do
-- sitemap); set_business_trial só barra sessões de dono, e aqui não há sessão.
--
-- E-mail da virada: public.plan_cutover_notices guarda um envio por negócio.
-- O app (lib/billing/plan-cutover-notices.ts, na rota de reconciliação do
-- pg_cron) reserva com claim_plan_cutover_notices(), manda com o id do envio
-- como Idempotency-Key no Resend e só então chama mark_plan_cutover_notice_sent().
-- Mesmo padrão de trial_reminder_sends (20261101010000): lease, até 5
-- tentativas, e o Resend descarta a repetição de um envio que saiu mas não foi
-- marcado.
--
-- Postura: security definer, `set search_path = ''`; a troca não tem grant, as
-- RPCs do e-mail são só service_role.
-- ===========================================================================

-- ===========================================================================
-- 1. Fila do e-mail da virada
-- ===========================================================================
create table public.plan_cutover_notices (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- O fim do teste dado na virada; o e-mail o mostra.
  trial_ends_at timestamptz not null,
  claim_token uuid,
  claimed_at timestamptz,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint plan_cutover_notices_once unique (business_id)
);

comment on table public.plan_cutover_notices is
  'E-mail da virada do plano único ao dono que ganhou o teste (#261, fase 7): no máximo um por negócio.';

alter table public.plan_cutover_notices enable row level security;
revoke all on table public.plan_cutover_notices from public, anon, authenticated;
grant select, insert, update, delete on table public.plan_cutover_notices to service_role;

-- ===========================================================================
-- 2. A troca
-- ===========================================================================
create or replace function private.apply_plan_cutover()
returns table (trials_granted integer, trials_cleared integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial_ends_at timestamptz := now() + interval '30 days';
  v_granted integer := 0;
  v_cleared integer := 0;
  v_business record;
begin
  alter table public.businesses disable trigger set_updated_at_businesses;

  for v_business in
    select
      b.id,
      b.owner_id,
      b.phone,
      (
        exists (
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
      ) as paid
    from public.businesses b
    where b.trial_ends_at = 'infinity'::timestamptz
    order by b.created_at
    for update of b
  loop
    if v_business.paid then
      update public.businesses
      set trial_ends_at = null
      where id = v_business.id;
      v_cleared := v_cleared + 1;
    else
      -- force: o registro entra mesmo que o telefone ou o e-mail já tenham um
      -- teste (dois negócios antigos com o mesmo telefone ganham os dois).
      perform private.claim_trial(v_business.id, v_business.owner_id, v_business.phone, 'migration', true);
      update public.businesses
      set trial_ends_at = v_trial_ends_at
      where id = v_business.id;
      insert into public.plan_cutover_notices (business_id, trial_ends_at)
      values (v_business.id, v_trial_ends_at)
      on conflict on constraint plan_cutover_notices_once do nothing;
      v_granted := v_granted + 1;
    end if;
  end loop;

  alter table public.businesses enable trigger set_updated_at_businesses;

  return query select v_granted, v_cleared;
end;
$$;

revoke all on function private.apply_plan_cutover() from public, anon, authenticated, service_role;

select * from private.apply_plan_cutover();

-- ===========================================================================
-- 3. 'infinity' não volta
-- ===========================================================================
alter table public.businesses
  add constraint businesses_trial_ends_at_finite
  check (trial_ends_at is null or isfinite(trial_ends_at));

comment on column public.businesses.trial_ends_at is
  'Fim do teste grátis (ADR 0013). null = sem teste. Sempre finito (#261, fase 7).';

-- ===========================================================================
-- 4. claim_plan_cutover_notices: reserva os e-mails da virada ainda não enviados.
-- Não sai para quem assinou depois da virada (assinatura atual `authorized`),
-- nem quando o teste da virada já acabou ou foi trocado pelo suporte: nesses
-- casos o e-mail diria algo que não vale mais.
-- ===========================================================================
create or replace function public.claim_plan_cutover_notices(
  p_limit integer default 25,
  p_lease_seconds integer default 900
)
returns table (
  send_id uuid,
  claim_token uuid,
  business_id uuid,
  business_name text,
  business_timezone text,
  trial_ends_at timestamptz,
  owner_email text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token uuid := extensions.gen_random_uuid();
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_PLAN_CUTOVER_NOTICE_LIMIT';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'INVALID_PLAN_CUTOVER_NOTICE_LEASE';
  end if;

  return query
  with due as (
    select n.id
    from public.plan_cutover_notices n
    join public.businesses b on b.id = n.business_id
    where n.sent_at is null
      and n.attempts < 5
      and (n.claimed_at is null or n.claimed_at < now() - make_interval(secs => p_lease_seconds))
      and b.trial_ends_at = n.trial_ends_at
      and n.trial_ends_at > now()
      and not exists (
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
    order by n.created_at
    limit p_limit
    for update of n skip locked
  ),
  claimed as (
    update public.plan_cutover_notices n
       set claim_token = v_token,
           claimed_at = now(),
           attempts = n.attempts + 1
      from due
     where n.id = due.id
    returning n.id, n.claim_token, n.business_id, n.trial_ends_at
  )
  select
    c.id,
    c.claim_token,
    b.id,
    b.name,
    b.timezone,
    c.trial_ends_at,
    u.email::text
  from claimed c
  join public.businesses b on b.id = c.business_id
  left join auth.users u on u.id = b.owner_id;
end;
$$;

revoke all on function public.claim_plan_cutover_notices(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_plan_cutover_notices(integer, integer) to service_role;

-- ===========================================================================
-- 5. mark_plan_cutover_notice_sent: grava o envio; só o dono do claim marca.
-- ===========================================================================
create or replace function public.mark_plan_cutover_notice_sent(
  p_send_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.plan_cutover_notices n
     set sent_at = now()
   where n.id = p_send_id
     and n.claim_token = p_claim_token
     and n.sent_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.mark_plan_cutover_notice_sent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_plan_cutover_notice_sent(uuid, uuid) to service_role;

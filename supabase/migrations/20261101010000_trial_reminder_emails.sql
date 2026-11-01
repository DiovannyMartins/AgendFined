-- ===========================================================================
-- E-mails de fim do teste grátis (#261, fase 5; spec 007 FR-014; ADR 0013).
--
-- O dono recebe três avisos por período de teste:
--   * trial_ends_in_3_days: faltam 2 ou 3 dias do teste (D-3);
--   * trial_ends_in_1_day: falta 1 dia ou o teste acaba hoje (D-1);
--   * trial_ended: o teste acabou e o negócio está suspenso (D0).
-- Os dias são datas de calendário no fuso do negócio (ADR 0001). As janelas não
-- se sobrepõem: um cron parado por um dia ainda manda o aviso seguinte, nunca
-- dois avisos de uma vez. O D0 só sai nos 3 dias depois do fim, para que um
-- teste antigo não receba um "seu teste acabou" fora de hora.
--
-- Não recebe aviso quem tem acesso pago, igual a business_has_access() sem o
-- teste: assinatura atual `authorized` (inclusive assinada durante o teste) ou
-- `paused`/`cancelled` em carência vigente (ADR 0008). trial_ends_at null ou
-- 'infinity' (negócio anterior ao plano único, até a fase 7) não tem fim.
--
-- Idempotência: public.trial_reminder_sends guarda um envio por (negócio,
-- trial_ends_at, tipo). Um teste novo concedido pelo suporte
-- (grant_business_trial) tem outro trial_ends_at, então os avisos do novo
-- período saem de novo. claim_trial_reminders() reserva o envio por um lease;
-- o app manda o e-mail com o id do envio como Idempotency-Key no Resend e só
-- então chama mark_trial_reminder_sent(). Se o app cair entre o envio e a
-- marcação, o lease vence, o próximo tick reclama o mesmo id e o Resend
-- descarta a repetição (mesma chave em 24 h). Depois de 5 tentativas o envio
-- para de ser reclamado.
--
-- Postura: security definer, `set search_path = ''`, só service_role.
-- ===========================================================================

create table public.trial_reminder_sends (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  trial_ends_at timestamptz not null,
  kind text not null
    constraint trial_reminder_sends_kind_check
    check (kind in ('trial_ends_in_3_days', 'trial_ends_in_1_day', 'trial_ended')),
  claim_token uuid,
  claimed_at timestamptz,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint trial_reminder_sends_once unique (business_id, trial_ends_at, kind)
);

comment on table public.trial_reminder_sends is
  'Avisos de fim do teste grátis enviados ao dono: no máximo um por negócio, período de teste (trial_ends_at) e tipo (#261).';

alter table public.trial_reminder_sends enable row level security;
revoke all on table public.trial_reminder_sends from public, anon, authenticated;
grant select, insert, update, delete on table public.trial_reminder_sends to service_role;

-- Negócios com teste finito; o cron só olha os que acabam perto de agora.
create index businesses_finite_trial_ends_at_idx
  on public.businesses (trial_ends_at)
  where trial_ends_at is not null and trial_ends_at <> 'infinity'::timestamptz;

-- ===========================================================================
-- claim_trial_reminders: reserva os avisos devidos em p_now.
-- p_now existe para os testes de integração fixarem o relógio; o app não o
-- passa. O lease conta sempre a partir do now() real.
-- ===========================================================================
create or replace function public.claim_trial_reminders(
  p_limit integer default 25,
  p_lease_seconds integer default 900,
  p_now timestamptz default null
)
returns table (
  send_id uuid,
  claim_token uuid,
  kind text,
  days_left integer,
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
  v_now timestamptz := coalesce(p_now, now());
  v_token uuid := extensions.gen_random_uuid();
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_TRIAL_REMINDER_LIMIT';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'INVALID_TRIAL_REMINDER_LEASE';
  end if;

  return query
  with due as (
    select
      b.id as business_id,
      b.trial_ends_at,
      ((b.trial_ends_at at time zone b.timezone)::date - (v_now at time zone b.timezone)::date) as days_left
    from public.businesses b
    where b.trial_ends_at is not null
      and isfinite(b.trial_ends_at)
      -- D-3 começa no máximo 4 dias de calendário antes; D0 vai até 3 dias depois.
      and b.trial_ends_at > v_now - interval '3 days'
      and b.trial_ends_at <= v_now + interval '5 days'
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
      and not exists (
        select 1
        from public.subscriptions g
        where g.business_id = b.id
          and g.status in ('paused', 'cancelled')
          and g.grace_period_end > v_now
      )
  ),
  kinds as (
    select
      d.business_id,
      d.trial_ends_at,
      d.days_left,
      case
        when d.trial_ends_at <= v_now then 'trial_ended'
        when d.days_left between 2 and 3 then 'trial_ends_in_3_days'
        when d.days_left <= 1 then 'trial_ends_in_1_day'
      end as kind
    from due d
  ),
  claimed as (
    insert into public.trial_reminder_sends as t (business_id, trial_ends_at, kind, claim_token, claimed_at, attempts)
    select k.business_id, k.trial_ends_at, k.kind, v_token, now(), 1
    from kinds k
    where k.kind is not null
    order by k.trial_ends_at
    limit p_limit
    on conflict on constraint trial_reminder_sends_once do update
      set claim_token = excluded.claim_token,
          claimed_at = excluded.claimed_at,
          attempts = t.attempts + 1
      where t.sent_at is null
        and t.attempts < 5
        and (t.claimed_at is null or t.claimed_at < now() - make_interval(secs => p_lease_seconds))
    returning t.id, t.claim_token, t.kind, t.business_id, t.trial_ends_at
  )
  select
    c.id,
    c.claim_token,
    c.kind,
    k.days_left,
    b.id,
    b.name,
    b.timezone,
    c.trial_ends_at,
    u.email::text
  from claimed c
  join kinds k on k.business_id = c.business_id and k.trial_ends_at = c.trial_ends_at
  join public.businesses b on b.id = c.business_id
  left join auth.users u on u.id = b.owner_id;
end;
$$;

revoke all on function public.claim_trial_reminders(integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_trial_reminders(integer, integer, timestamptz) to service_role;

-- ===========================================================================
-- mark_trial_reminder_sent: grava o envio; só o dono do claim marca.
-- ===========================================================================
create or replace function public.mark_trial_reminder_sent(
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
  update public.trial_reminder_sends t
     set sent_at = now()
   where t.id = p_send_id
     and t.claim_token = p_claim_token
     and t.sent_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.mark_trial_reminder_sent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_trial_reminder_sent(uuid, uuid) to service_role;

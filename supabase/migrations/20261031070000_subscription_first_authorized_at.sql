-- O gate de termos do checkout (lib/billing/checkout-terms.ts) só confere a
-- primeira autorização de uma assinatura. Ele deduzia "nunca autorizada" do
-- status local `pending`, mas um checkout fechado `paused`/`cancelled` antes de
-- ser pago, ou inserido `paused` pela reconciliação, perde essa informação: se o
-- mesmo preapproval fosse autorizado depois, abaixo do preço atual ou fora de
-- BRL mensal, o negócio virava PROFISSIONAL sem a checagem (GHSA-53c9-8q53-4x8c).
--
-- `first_authorized_at` guarda o fato no banco: o trigger o preenche na primeira
-- escrita `authorized` da linha, por qualquer caminho (apply_subscription_snapshot,
-- reconcile_billing_attempt_subscription ou service role), e nunca o apaga nem
-- o muda depois.

alter table public.subscriptions
  add column if not exists first_authorized_at timestamptz;

comment on column public.subscriptions.first_authorized_at is
  'Primeira vez que a linha ficou authorized; preenchida por trigger e imutável. Nula = nunca paga.';

create or replace function private.subscriptions_first_authorized_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.first_authorized_at is not null then
    new.first_authorized_at := old.first_authorized_at;
  elsif new.status = 'authorized' then
    new.first_authorized_at := coalesce(new.first_authorized_at, now());
  else
    new.first_authorized_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.subscriptions_first_authorized_at() from public, anon, authenticated;

drop trigger if exists subscriptions_first_authorized_at on public.subscriptions;
create trigger subscriptions_first_authorized_at
  before insert or update on public.subscriptions
  for each row execute function private.subscriptions_first_authorized_at();

-- Linhas existentes: `authorized` foi paga; `paused`/`cancelled` com carência
-- também, porque a carência só abre quando uma assinatura paga para (ADR 0008,
-- lib/billing/grace.ts). As demais nunca foram pagas e passam pelo gate. Os
-- triggers ficam desligados só no backfill: o novo apagaria a data em linhas
-- paradas e o de updated_at mudaria a data das linhas sem mudança de estado.
alter table public.subscriptions disable trigger subscriptions_first_authorized_at;
alter table public.subscriptions disable trigger set_updated_at_subscriptions;
update public.subscriptions
set first_authorized_at = coalesce(current_period_start, updated_at)
where first_authorized_at is null
  and (status = 'authorized' or grace_period_end is not null);
alter table public.subscriptions enable trigger set_updated_at_subscriptions;
alter table public.subscriptions enable trigger subscriptions_first_authorized_at;

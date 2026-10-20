-- ADR 0007: trocar o slug derrubava o link público já divulgado (WhatsApp,
-- Instagram, QR Code impresso), que passava a dar 404 (issue #124). Cada slug
-- que um negócio deixa de usar fica em business_slug_history, apontando para o
-- negócio, e `/<slug-antigo>` redireciona para o slug atual.
--
-- O slug antigo fica reservado enquanto o negócio existir: nenhum outro negócio
-- pode escolhê-lo, então um link divulgado nunca passa a levar a outro negócio.
-- O próprio negócio pode voltar a ele. Excluir o negócio libera os slugs pela
-- cascata.
create table public.business_slug_history (
  slug text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index business_slug_history_business_id_idx
  on public.business_slug_history (business_id);

-- Só o trigger e a RPC abaixo (security definer) leem ou gravam o histórico.
alter table public.business_slug_history enable row level security;
revoke all on table public.business_slug_history from public, anon, authenticated;
grant select, insert, update, delete on table public.business_slug_history to service_role;

-- security definer porque o dono troca o slug com a própria sessão e não tem
-- acesso ao histórico.
create or replace function public.track_business_slug_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  -- Serializa quem libera e quem toma o mesmo slug: se A troca x por y enquanto
  -- B tenta x, B espera A terminar e então encontra x no histórico. A ordem fixa
  -- dos locks evita deadlock entre duas trocas cruzadas.
  if tg_op = 'UPDATE' then
    perform pg_advisory_xact_lock(hashtextextended('business_slug:' || least(old.slug, new.slug), 0));
    perform pg_advisory_xact_lock(hashtextextended('business_slug:' || greatest(old.slug, new.slug), 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('business_slug:' || new.slug, 0));
  end if;

  if exists (
    select 1
    from public.business_slug_history h
    where h.slug = new.slug
      and h.business_id <> new.id
  ) then
    -- O mesmo código da unique de businesses.slug: para quem escolhe o slug,
    -- ele já está em uso.
    raise exception 'BUSINESS_SLUG_IN_HISTORY'
      using errcode = '23505';
  end if;

  if tg_op = 'UPDATE' then
    -- Voltar a um slug antigo o torna atual de novo, então ele sai do histórico.
    delete from public.business_slug_history
    where slug = new.slug;

    insert into public.business_slug_history (slug, business_id)
    values (old.slug, new.id)
    on conflict (slug) do update
      set business_id = excluded.business_id,
          created_at = excluded.created_at;
  end if;

  return new;
end;
$$;

revoke all on function public.track_business_slug_history()
  from public, anon, authenticated, service_role;

drop trigger if exists track_business_slug_history on public.businesses;
create trigger track_business_slug_history
  before insert or update of slug on public.businesses
  for each row execute function public.track_business_slug_history();

-- Lookup público do slug antigo (ADR 0006): devolve só o slug atual, que já é
-- público, e só de um negócio ativo, como get_public_business.
create function public.get_business_slug_redirect(p_slug text)
returns table (slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.slug
  from public.business_slug_history h
  join public.businesses b on b.id = h.business_id
  where h.slug = p_slug
    and b.is_active = true
$$;

revoke all on function public.get_business_slug_redirect(text) from public;
grant execute on function public.get_business_slug_redirect(text) to anon, authenticated, service_role;

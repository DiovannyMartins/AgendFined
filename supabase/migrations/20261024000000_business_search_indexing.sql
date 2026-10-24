-- Um negócio pode ficar ativo (página pública, reservas) sem aparecer para
-- buscadores. Serve aos negócios de teste em produção: o smoke test
-- pós-deploy precisa de uma página pública funcionando, e desativar o negócio
-- era a única forma de tirá-lo do sitemap, então ele acabava reativado e
-- voltava ao Google. Com `search_indexing_enabled = false` o negócio sai do
-- sitemap e a página pública responde com `noindex, nofollow`.
--
-- Não há tela para isso: o operador marca o negócio pelo SQL Editor
-- (docs/operacao-producao.md, "Negócios de teste em produção").
alter table public.businesses
  add column if not exists search_indexing_enabled boolean not null default true;

comment on column public.businesses.search_indexing_enabled is
  'false keeps an active business out of the sitemap and marks its public page noindex.';

-- A projeção pública (ADR 0006) passa a levar o campo, que a página pública
-- usa nos metadados. Continua sem nenhuma configuração privada.
drop function if exists public.get_public_business(text);

create function public.get_public_business(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  timezone text,
  search_indexing_enabled boolean
)
language sql
security definer
set search_path = ''
as $$
  select b.id, b.name, b.slug, b.description, b.timezone, b.search_indexing_enabled
  from public.businesses b
  where b.slug = p_slug
    and b.is_active = true
$$;

revoke all on function public.get_public_business(text) from public;
grant execute on function public.get_public_business(text) to anon, authenticated, service_role;

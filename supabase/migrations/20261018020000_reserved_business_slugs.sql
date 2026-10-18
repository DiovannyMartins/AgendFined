-- Issue #114, item 9: os slugs reservados (lib/business/reserved-slugs.ts) só
-- eram recusados por upsertBusiness. Com a sessão do dono, a API REST aceitava
-- `slug = 'dashboard'`, e a rota estática ganha de app/[slug], então a página
-- pública do próprio negócio ficava inacessível.
--
-- Um trigger, e não um CHECK, porque só a escolha de um slug novo é recusada:
-- um negócio que já tenha um slug reservado continua salvando os outros campos
-- e é obrigado a trocá-lo apenas quando mudar o slug.
--
-- A lista espelha RESERVED_SLUGS; tests/support/reserved-slugs-sql.test.ts
-- compara as duas e falha se divergirem. Ao reservar um slug novo, crie uma
-- migration que redefina esta função com a lista completa.
create or replace function public.reject_reserved_business_slug()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.slug is distinct from old.slug)
    and lower(new.slug) = any (array[
      -- slugs:begin
      'api',
      'auth',
      'cadastro',
      'dashboard',
      'login',
      'mfa',
      'privacidade',
      'recuperar-senha',
      'redefinir-senha',
      'termos',
      'apple-icon',
      'favicon',
      'icon',
      'manifest',
      'robots',
      'sitemap',
      'brand',
      'images',
      'admin',
      'precos',
      'pricing',
      'recursos',
      'suporte'
      -- slugs:end
    ]) then
    raise exception 'BUSINESS_SLUG_RESERVED'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_reserved_business_slug()
  from public, anon, authenticated, service_role;

drop trigger if exists reject_reserved_business_slug on public.businesses;
create trigger reject_reserved_business_slug
  before insert or update of slug on public.businesses
  for each row execute function public.reject_reserved_business_slug();

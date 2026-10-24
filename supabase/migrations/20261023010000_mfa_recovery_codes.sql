-- #169: saída para o dono que perde o autenticador (ADR 0009).
--
-- Supabase Auth não tem códigos de recuperação nativos. Ao ativar o MFA, a
-- Server Action gera dez códigos de uso único e grava aqui só o digest
-- SHA-256 de cada um, no molde do token de cancelamento (ADR 0005):
--
--   * `replace_mfa_recovery_codes` troca todos os códigos do usuário de uma
--     vez; os anteriores deixam de valer;
--   * `consume_mfa_recovery_code` apaga o código usado e responde se ele
--     existia; a Server Action então remove os fatores pela API admin do Auth;
--   * `clear_mfa_recovery_codes` apaga o que sobrou quando o autenticador sai;
--   * `count_mfa_recovery_codes` alimenta a tela /mfa.
--
-- Tabela e RPCs ficam restritas à service role: o navegador nunca lê nem
-- escreve digests.

create table if not exists public.mfa_recovery_codes (
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, code_hash),
  constraint mfa_recovery_codes_code_hash_format check (code_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.mfa_recovery_codes is
  'Digests SHA-256 dos códigos de recuperação do MFA; o código bruto nunca é armazenado (ADR 0009).';

alter table public.mfa_recovery_codes enable row level security;

revoke all on table public.mfa_recovery_codes from public, anon, authenticated;
grant select, insert, delete on table public.mfa_recovery_codes to service_role;

create or replace function public.replace_mfa_recovery_codes(p_user_id uuid, p_code_hashes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;
  if coalesce(cardinality(p_code_hashes), 0) <> 10
     or exists (select 1 from unnest(p_code_hashes) as h where h is null or h !~ '^[0-9a-f]{64}$')
     or (select count(distinct h) from unnest(p_code_hashes) as h) <> 10 then
    raise exception 'INVALID_RECOVERY_CODES';
  end if;

  delete from public.mfa_recovery_codes where user_id = p_user_id;
  insert into public.mfa_recovery_codes (user_id, code_hash)
  select p_user_id, h from unnest(p_code_hashes) as h;
end;
$$;

-- Duas tentativas simultâneas com o mesmo código: o delete da segunda espera
-- o lock da primeira e não encontra mais a linha, então só uma vale.
create or replace function public.consume_mfa_recovery_code(p_user_id uuid, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.mfa_recovery_codes
  where user_id = p_user_id and code_hash = p_code_hash;
  return found;
end;
$$;

create or replace function public.clear_mfa_recovery_codes(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.mfa_recovery_codes where user_id = p_user_id;
$$;

create or replace function public.count_mfa_recovery_codes(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.mfa_recovery_codes where user_id = p_user_id;
$$;

revoke all on function public.replace_mfa_recovery_codes(uuid, text[]) from public, anon, authenticated;
grant execute on function public.replace_mfa_recovery_codes(uuid, text[]) to service_role;
revoke all on function public.consume_mfa_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_mfa_recovery_code(uuid, text) to service_role;
revoke all on function public.clear_mfa_recovery_codes(uuid) from public, anon, authenticated;
grant execute on function public.clear_mfa_recovery_codes(uuid) to service_role;
revoke all on function public.count_mfa_recovery_codes(uuid) from public, anon, authenticated;
grant execute on function public.count_mfa_recovery_codes(uuid) to service_role;

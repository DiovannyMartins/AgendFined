-- GHSA-vjcg: o limite de tentativas do código TOTP (auth:mfa|user:<id>, 10 a
-- cada 15 min) vive na Server Action verifyTotp, mas quem já sabe a senha do
-- dono consegue uma sessão aal1 e chama POST /factors/{id}/challenge e
-- /factors/{id}/verify direto no Supabase Auth, sem passar pelo contador. O
-- plano Free não oferece o hook de tentativa de MFA, e uma tentativa errada
-- não deixa rastro no banco (o mesmo desafio aceita vários palpites), então o
-- banco não consegue contar os erros. Ele consegue ver os acertos.
--
-- Esta migration só reconhece o segundo fator confirmado pelo app:
--
--   * antes de verificar, a Server Action registra o desafio que ela criou
--     (`grant_mfa_challenge`, só service_role) com a sessão que o confirma;
--   * quando o Auth marca um desafio como verificado, o trigger em
--     auth.mfa_challenges guarda a sessão em private.mfa_verified_sessions se
--     o desafio tinha registro; sem registro, guarda a verificação direta em
--     private.mfa_out_of_band_verifications;
--   * private.mfa_aal_allowed() passa a exigir, de quem tem fator verificado,
--     aal2 numa sessão confirmada pelo app. Um aal2 obtido direto no Auth não
--     abre RLS nem as RPCs do dono;
--   * depois de uma verificação direta, grant_mfa_challenge recusa por 15
--     minutos, então o código acertado fora do app não serve no app;
--   * remover um fator verificado também exige registro do app
--     (`grant_mfa_factor_removal`), senão a sessão aal2 direta poderia apagar o
--     fator no Auth e voltar a valer como aal1 sem MFA.
--
-- As sessões aal2 que já existem ficam valendo (backfill abaixo).

create table private.mfa_challenge_grants (
  challenge_id uuid primary key references auth.mfa_challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references auth.sessions (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table private.mfa_verified_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now()
);

create table private.mfa_out_of_band_verifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  factor_id uuid not null,
  challenge_id uuid not null,
  verified_at timestamptz not null default now()
);

create index mfa_out_of_band_verifications_user_time
  on private.mfa_out_of_band_verifications (user_id, verified_at desc);

create table private.mfa_factor_removal_grants (
  factor_id uuid primary key references auth.mfa_factors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on table private.mfa_challenge_grants, private.mfa_verified_sessions,
  private.mfa_out_of_band_verifications, private.mfa_factor_removal_grants
  from public, anon, authenticated;

insert into private.mfa_verified_sessions (session_id, user_id)
select distinct s.id, s.user_id
from auth.sessions s
join auth.mfa_amr_claims c on c.session_id = s.id
where s.aal = 'aal2' and c.authentication_method = 'totp'
on conflict (session_id) do nothing;

-- Roda dentro da transação do Auth. Não levanta erro de propósito: o registro
-- da verificação direta precisa ficar gravado junto com ela.
create function private.record_mfa_challenge_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factor_user uuid;
  v_grant_user uuid;
  v_grant_session uuid;
begin
  select f.user_id into v_factor_user from auth.mfa_factors f where f.id = new.factor_id;

  delete from private.mfa_challenge_grants g
  where g.challenge_id = new.id
    and g.created_at > now() - interval '5 minutes'
  returning g.user_id, g.session_id into v_grant_user, v_grant_session;

  if v_grant_session is not null and v_grant_user = v_factor_user then
    insert into private.mfa_verified_sessions (session_id, user_id)
    values (v_grant_session, v_grant_user)
    on conflict (session_id) do update
      set user_id = excluded.user_id, verified_at = excluded.verified_at;
  else
    insert into private.mfa_out_of_band_verifications (user_id, factor_id, challenge_id)
    values (v_factor_user, new.factor_id, new.id);
  end if;
  return null;
end;
$$;

create trigger record_mfa_challenge_verification
after update of verified_at on auth.mfa_challenges
for each row
when (old.verified_at is null and new.verified_at is not null)
execute function private.record_mfa_challenge_verification();

-- A exclusão em cascata do usuário passa: auth.users já não tem a linha.
create function private.guard_mfa_factor_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'verified'
     or not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  delete from private.mfa_factor_removal_grants g
  where g.factor_id = old.id
    and g.user_id = old.user_id
    and g.created_at > now() - interval '5 minutes';
  if found then
    return old;
  end if;
  raise exception 'MFA_FACTOR_REMOVAL_NOT_GRANTED' using errcode = '42501';
end;
$$;

create trigger guard_mfa_factor_removal
before delete on auth.mfa_factors
for each row
execute function private.guard_mfa_factor_removal();

-- false quando houve verificação direta do usuário nos últimos 15 minutos.
create function public.grant_mfa_challenge(p_user_id uuid, p_session_id uuid, p_challenge_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from auth.mfa_challenges c
    join auth.mfa_factors f on f.id = c.factor_id
    where c.id = p_challenge_id and c.verified_at is null and f.user_id = p_user_id
  ) or not exists (
    select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id
  ) then
    raise exception 'INVALID_MFA_CHALLENGE';
  end if;

  if exists (
    select 1 from private.mfa_out_of_band_verifications o
    where o.user_id = p_user_id and o.verified_at > now() - interval '15 minutes'
  ) then
    return false;
  end if;

  insert into private.mfa_challenge_grants (challenge_id, user_id, session_id)
  values (p_challenge_id, p_user_id, p_session_id)
  on conflict (challenge_id) do update
    set user_id = excluded.user_id, session_id = excluded.session_id, created_at = excluded.created_at;
  return true;
end;
$$;

create function public.grant_mfa_factor_removal(p_user_id uuid, p_factor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.mfa_factors f where f.id = p_factor_id and f.user_id = p_user_id) then
    raise exception 'INVALID_MFA_FACTOR';
  end if;
  insert into private.mfa_factor_removal_grants (factor_id, user_id)
  values (p_factor_id, p_user_id)
  on conflict (factor_id) do update
    set user_id = excluded.user_id, created_at = excluded.created_at;
end;
$$;

-- Para o app: a sessão do JWT confirmou o segundo fator pelo app?
create function public.current_session_mfa_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select exists (
      select 1 from private.mfa_verified_sessions s
      where s.session_id = nullif((select auth.jwt()->>'session_id'), '')::uuid
        and s.user_id = (select auth.uid())
    )
  ), false);
$$;

revoke all on function public.grant_mfa_challenge(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_mfa_challenge(uuid, uuid, uuid) to service_role;
revoke all on function public.grant_mfa_factor_removal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_mfa_factor_removal(uuid, uuid) to service_role;
revoke all on function public.current_session_mfa_verified() from public, anon;
grant execute on function public.current_session_mfa_verified() to authenticated;

create or replace function private.mfa_aal_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null and case
      when exists (
        select 1 from auth.mfa_factors
        where user_id = (select auth.uid()) and status = 'verified'
      ) then
        (select auth.jwt()->>'aal') = 'aal2' and exists (
          select 1 from private.mfa_verified_sessions s
          where s.session_id = nullif((select auth.jwt()->>'session_id'), '')::uuid
            and s.user_id = (select auth.uid())
        )
      else (select auth.jwt()->>'aal') in ('aal1', 'aal2')
    end,
    false
  );
$$;
revoke all on function private.mfa_aal_allowed() from public, anon;
grant execute on function private.mfa_aal_allowed() to authenticated;

-- private.mfa_aal_allowed() retorna false em vez de NULL quando o JWT não traz
-- o claim aal. As políticas RLS restritivas já tratavam NULL como negado, mas as
-- RPCs security definer do dono usam `if not private.mfa_aal_allowed()`, em que
-- NULL não dispara o raise. Com o coalesce, as RPCs e o RLS passam a decidir
-- igual; as regras do MFA opt-in (ADR 0009) não mudam.
create or replace function private.mfa_aal_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null and
      (select auth.jwt()->>'aal') =
        case when exists (
          select 1 from auth.mfa_factors
          where user_id = (select auth.uid()) and status = 'verified'
        ) then 'aal2' else 'aal1' end
      or (select auth.uid()) is not null and (select auth.jwt()->>'aal') = 'aal2',
    false
  );
$$;
revoke all on function private.mfa_aal_allowed() from public, anon;
grant execute on function private.mfa_aal_allowed() to authenticated;

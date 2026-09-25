-- An account that enrolled a verified factor must finish MFA before accessing
-- application data, including through the Supabase Data API directly.
-- Unenrolled accounts retain their existing aal1 access during rollout.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.mfa_aal_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and
    (select auth.jwt()->>'aal') =
      case when exists (
        select 1 from auth.mfa_factors
        where user_id = (select auth.uid()) and status = 'verified'
      ) then 'aal2' else 'aal1' end
    or (select auth.uid()) is not null and (select auth.jwt()->>'aal') = 'aal2';
$$;
revoke all on function private.mfa_aal_allowed() from public, anon;
grant execute on function private.mfa_aal_allowed() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'businesses', 'services', 'availability',
    'availability_blocks', 'professionals', 'customers', 'bookings',
    'waitlist_entries', 'subscriptions'
  ] loop
    execute format(
      'create policy require_verified_mfa on public.%I as restrictive for all to authenticated using ((select private.mfa_aal_allowed())) with check ((select private.mfa_aal_allowed()))',
      table_name
    );
  end loop;
end;
$$;

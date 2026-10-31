-- GHSA-xw77-prpg-jpg5: businesses.timezone is validated in the database, not
-- only in the Server Action, because the owner session can update businesses
-- through PostgREST directly (20261031050000_business_timezone_validated).
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/business-timezone-validated.sql
-- Everything runs in one transaction that is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function pg_temp.raises(p_sql text, p_message text)
returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception when others then
  if sqlerrm <> p_message then
    raise exception 'expected %, got %', p_message, sqlerrm;
  end if;
  return true;
end;
$$;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'tz-validated@example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono fuso');

  -- A new negócio only takes a Brazilian fuso.
  if not pg_temp.raises(format(
    $q$insert into public.businesses (id, owner_id, name, slug, phone, timezone)
       values (%L, %L, 'Negocio', 'tz-validated', '11988887777', 'FOO+3')$q$,
    v_business, v_owner), 'BUSINESS_TIMEZONE_INVALID') then
    raise exception 'insert with a POSIX fuso must be refused';
  end if;
  if not pg_temp.raises(format(
    $q$insert into public.businesses (id, owner_id, name, slug, phone, timezone)
       values (%L, %L, 'Negocio', 'tz-validated', '11988887777', 'Europe/Lisbon')$q$,
    v_business, v_owner), 'BUSINESS_TIMEZONE_INVALID') then
    raise exception 'insert with a fuso abroad must be refused';
  end if;

  insert into public.businesses (id, owner_id, name, slug, phone, timezone)
  values (v_business, v_owner, 'Negocio', 'tz-validated', '11988887777', 'America/Manaus');

  -- The owner, through the Data API, cannot store an invalid fuso.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  if not pg_temp.raises(format(
    $q$update public.businesses set timezone = 'FOO+3' where id = %L$q$, v_business),
    'BUSINESS_TIMEZONE_INVALID') then
    raise exception 'owner update to a POSIX fuso must be refused';
  end if;
  if not pg_temp.raises(format(
    $q$update public.businesses set timezone = 'America/New_York' where id = %L$q$, v_business),
    'BUSINESS_TIMEZONE_INVALID') then
    raise exception 'owner update to a fuso abroad must be refused';
  end if;
  update public.businesses set timezone = 'America/Sao_Paulo' where id = v_business;
  reset role;

  -- A negócio whose fuso was set abroad before #189 keeps it while it saves
  -- the other fields.
  alter table public.businesses disable trigger validate_business_timezone;
  update public.businesses set timezone = 'Europe/Lisbon' where id = v_business;
  alter table public.businesses enable trigger validate_business_timezone;
  update public.businesses set name = 'Negocio renomeado', timezone = 'Europe/Lisbon' where id = v_business;
  if (select timezone from public.businesses where id = v_business) <> 'Europe/Lisbon' then
    raise exception 'a legacy fuso abroad must survive an update of other fields';
  end if;
end;
$$;

rollback;

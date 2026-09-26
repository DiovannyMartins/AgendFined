-- Private, read-only export of the Auth records needed by AgendFined.
-- The existing backup login can call this function but cannot access auth.
create schema if not exists backup_internal;
revoke all on schema backup_internal from public;

create or replace function backup_internal.export_auth_sql()
returns setof text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  table_name text;
  column_list text;
begin
  if session_user <> 'agendfined_backup' then
    raise exception 'Auth backup is restricted to the backup login';
  end if;

  return next '-- AgendFined Auth account data (users, identities, TOTP factors)';

  foreach table_name in array array['users', 'identities', 'mfa_factors'] loop
    select string_agg(format('%I', a.attname), ', ' order by a.attnum)
      into column_list
      from pg_catalog.pg_attribute as a
     where a.attrelid = format('auth.%I', table_name)::regclass
       and a.attnum > 0
       and not a.attisdropped
       and a.attgenerated = '';

    return query execute format(
      'select format(''insert into auth.%1$I (%2$s) select %2$s from jsonb_populate_record(null::auth.%1$I, %%L::jsonb);'', to_jsonb(t)::text) from auth.%1$I as t order by t.id',
      table_name, column_list
    );
  end loop;
end;
$$;

revoke all on function backup_internal.export_auth_sql() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'agendfined_backup') then
    grant usage on schema backup_internal to agendfined_backup;
    grant execute on function backup_internal.export_auth_sql() to agendfined_backup;
  end if;
end;
$$;

-- GHSA-xw77-prpg-jpg5: the Brazilian-fuso rule (#189) lived only in the Server
-- Action (lib/business/actions.ts checkTimezone), but the owner session can
-- update businesses through PostgREST directly. Postgres accepts POSIX strings
-- such as 'FOO+3' in AT TIME ZONE, so reservas could be created under a fuso
-- that Intl cannot format, and the shared booking-reminders lote would fail
-- for every negócio. Mirror the Server Action rule here: a new negócio or a
-- fuso change only takes a Brazilian IANA id (keep the list in sync with
-- BRAZILIAN_TIMEZONES in lib/app-timezone.ts). A negócio whose fuso was set
-- abroad before #189 keeps it while it saves the other fields.
create or replace function public.validate_business_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.timezone is distinct from old.timezone)
     and new.timezone not in (
       'America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Boa_Vista', 'America/Campo_Grande',
       'America/Cuiaba', 'America/Eirunepe', 'America/Fortaleza', 'America/Maceio', 'America/Manaus',
       'America/Noronha', 'America/Porto_Acre', 'America/Porto_Velho', 'America/Recife', 'America/Rio_Branco',
       'America/Santarem', 'America/Sao_Paulo', 'Brazil/Acre', 'Brazil/DeNoronha', 'Brazil/East', 'Brazil/West'
     ) then
    raise exception 'BUSINESS_TIMEZONE_INVALID'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_business_timezone()
  from public, anon, authenticated, service_role;

drop trigger if exists validate_business_timezone on public.businesses;
create trigger validate_business_timezone
  before insert or update of timezone on public.businesses
  for each row execute function public.validate_business_timezone();

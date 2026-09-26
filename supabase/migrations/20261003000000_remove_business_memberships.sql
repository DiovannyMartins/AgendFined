-- Return to one owner per business and remove the unused login-based team model.
begin;
set local lock_timeout = '10s';

lock table public.business_memberships in access exclusive mode;
do $$
begin
  if exists (select 1 from public.business_memberships) then
    raise exception 'Cannot remove business memberships while member rows exist';
  end if;
end;
$$;

alter policy businesses_select_own on public.businesses
  using (owner_id = (select auth.uid()));

do $$
declare
  item text[];
  table_name text;
  policy_prefix text;
  owner_check text := 'exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid()))';
begin
  foreach item slice 1 in array array[
    array['services','services'],
    array['availability','availability'],
    array['availability_blocks','blocks'],
    array['customers','customers'],
    array['bookings','bookings']
  ] loop
    table_name := item[1];
    policy_prefix := item[2];
    execute format('alter policy %I on public.%I using (%s)', policy_prefix || '_select_own', table_name, owner_check);
    execute format('alter policy %I on public.%I with check (%s)', policy_prefix || '_insert_own', table_name, owner_check);
    if table_name <> 'customers' then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', policy_prefix || '_update_own', table_name, owner_check, owner_check);
    end if;
    if table_name in ('services','availability','availability_blocks') then
      execute format('alter policy %I on public.%I using (%s)', policy_prefix || '_delete_own', table_name, owner_check);
    end if;
  end loop;
end;
$$;

alter policy waitlist_entries_owner_select on public.waitlist_entries
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
alter policy subscriptions_select_own on public.subscriptions
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

-- Preserve the existing waitlist logic and replace only its role guard.
do $$
declare
  fn regprocedure;
  definition text;
  old_guard text := 'private.has_business_role(v_entry.business_id, array[''admin'',''editor'']::public.business_role[])';
  new_guard text := 'exists (select 1 from public.businesses b where b.id = v_entry.business_id and b.owner_id = (select auth.uid()))';
begin
  foreach fn in array array[
    'public.notify_waitlist_entry(uuid)'::regprocedure,
    'public.convert_waitlist_entry(uuid,text)'::regprocedure
  ] loop
    definition := pg_get_functiondef(fn);
    if position(old_guard in definition) = 0 then
      raise exception 'Expected role guard missing in %', fn;
    end if;
    execute replace(definition, old_guard, new_guard);
  end loop;
end;
$$;
drop table public.business_memberships;
drop function private.has_business_role(uuid, public.business_role[]);
drop type public.business_role;
commit;

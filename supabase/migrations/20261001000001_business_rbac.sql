-- Business-scoped roles. Existing owners are admins without a membership row.
create type public.business_role as enum ('admin', 'editor', 'user');

create table public.business_memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.business_role not null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create unique index business_memberships_user_id_idx on public.business_memberships(user_id);
alter table public.business_memberships enable row level security;
revoke all on public.business_memberships from public, anon;
grant select, insert, update, delete on public.business_memberships to authenticated, service_role;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.has_business_role(p_business_id uuid, p_roles public.business_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (
      select 1 from public.businesses b
      where b.id = p_business_id and b.owner_id = (select auth.uid())
        and 'admin'::public.business_role = any(p_roles)
    )
    or exists (
      select 1 from public.business_memberships m
      where m.business_id = p_business_id and m.user_id = (select auth.uid())
        and m.role = any(p_roles)
    )
  );
$$;
revoke all on function private.has_business_role(uuid, public.business_role[]) from public, anon;
grant execute on function private.has_business_role(uuid, public.business_role[]) to authenticated;

create policy memberships_select on public.business_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_business_role(business_id, array['admin']::public.business_role[])));
create policy memberships_insert on public.business_memberships for insert to authenticated
  with check ((select private.has_business_role(business_id, array['admin']::public.business_role[])));
create policy memberships_update on public.business_memberships for update to authenticated
  using ((select private.has_business_role(business_id, array['admin']::public.business_role[])))
  with check ((select private.has_business_role(business_id, array['admin']::public.business_role[])));
create policy memberships_delete on public.business_memberships for delete to authenticated
  using ((select private.has_business_role(business_id, array['admin']::public.business_role[])));

create policy require_verified_mfa on public.business_memberships as restrictive for all to authenticated
  using ((select private.mfa_aal_allowed()))
  with check ((select private.mfa_aal_allowed()));

alter policy businesses_select_own on public.businesses
  using ((select private.has_business_role(id, array['admin','editor','user']::public.business_role[])));
-- The original INSERT, UPDATE and DELETE policies remain owner-only; in
-- particular, an invited admin must not be able to reassign owner_id.
do $$
declare
  item text[];
  table_name text;
  policy_prefix text;
begin
  foreach item slice 1 in array array[
    array['services','services'],
    array['availability','availability'],
    array['availability_blocks','blocks'],
    array['professionals','professionals'],
    array['customers','customers'],
    array['bookings','bookings']
  ] loop
    table_name := item[1];
    policy_prefix := item[2];
    execute format('alter policy %I on public.%I using ((select private.has_business_role(business_id, array[''admin'',''editor'',''user'']::public.business_role[])))', policy_prefix || '_select_own', table_name);
    execute format('alter policy %I on public.%I with check ((select private.has_business_role(business_id, array[''admin'',''editor'']::public.business_role[])))', policy_prefix || '_insert_own', table_name);
    if table_name <> 'customers' then
      execute format('alter policy %I on public.%I using ((select private.has_business_role(business_id, array[''admin'',''editor'']::public.business_role[]))) with check ((select private.has_business_role(business_id, array[''admin'',''editor'']::public.business_role[])))', policy_prefix || '_update_own', table_name);
    end if;
    if table_name in ('services','availability','availability_blocks') then
      execute format('alter policy %I on public.%I using ((select private.has_business_role(business_id, array[''admin'',''editor'']::public.business_role[])))', policy_prefix || '_delete_own', table_name);
    end if;
  end loop;
end;
$$;

alter policy waitlist_entries_owner_select on public.waitlist_entries
  using ((select private.has_business_role(business_id, array['admin','editor','user']::public.business_role[])));
alter policy subscriptions_select_own on public.subscriptions
  using ((select private.has_business_role(business_id, array['admin','editor','user']::public.business_role[])));

-- Security-definer waitlist RPCs bypass RLS; enforce the same MFA and role checks inside them.
create or replace function public.notify_waitlist_entry(p_entry_id uuid)
returns public.waitlist_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
begin
  select * into v_entry
  from public.waitlist_entries
  where id = p_entry_id;

  if v_entry is null then
    raise exception 'WAITLIST_ENTRY_NOT_FOUND';
  end if;

  if not private.mfa_aal_allowed()
     or not private.has_business_role(v_entry.business_id, array['admin','editor']::public.business_role[]) then
    raise exception 'WAITLIST_NOT_OWNER';
  end if;

  if not exists (
    select 1 from public.businesses b
    where b.id = v_entry.business_id
      and b.plan = 'pro'
  ) then
    raise exception 'WAITLIST_PRO_REQUIRED';
  end if;

  if v_entry.status = 'converted' then
    raise exception 'WAITLIST_ALREADY_CONVERTED';
  end if;
  if v_entry.status = 'cancelled' then
    raise exception 'WAITLIST_CANCELLED';
  end if;

  update public.waitlist_entries
  set status = 'notified'
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.notify_waitlist_entry(uuid) from public, anon, service_role;
grant execute on function public.notify_waitlist_entry(uuid) to authenticated;


create or replace function public.convert_waitlist_entry(
  p_entry_id uuid,
  p_cancel_token_hash text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.waitlist_entries;
  v_booking public.bookings;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CANCEL_TOKEN_HASH';
  end if;

  select * into v_entry
  from public.waitlist_entries
  where id = p_entry_id;

  if v_entry is null then
    raise exception 'WAITLIST_ENTRY_NOT_FOUND';
  end if;

  if not private.mfa_aal_allowed()
     or not private.has_business_role(v_entry.business_id, array['admin','editor']::public.business_role[]) then
    raise exception 'WAITLIST_NOT_OWNER';
  end if;

  if not exists (
    select 1 from public.businesses b
    where b.id = v_entry.business_id
      and b.plan = 'pro'
  ) then
    raise exception 'WAITLIST_PRO_REQUIRED';
  end if;

  if v_entry.status = 'converted' then
    raise exception 'WAITLIST_ALREADY_CONVERTED';
  end if;
  if v_entry.status = 'cancelled' then
    raise exception 'WAITLIST_CANCELLED';
  end if;
  if v_entry.start_at <= now() then
    raise exception 'WAITLIST_PAST_SLOT';
  end if;

  select * into v_booking
  from public.create_booking(
    p_business_id := v_entry.business_id,
    p_service_id := v_entry.service_id,
    p_start_at := v_entry.start_at,
    p_customer_name := v_entry.customer_name,
    p_customer_phone := v_entry.customer_phone,
    p_cancel_token_hash := p_cancel_token_hash,
    p_customer_email := v_entry.customer_email
  );

  update public.waitlist_entries
  set status = 'converted'
  where id = p_entry_id;

  return v_booking;
end;
$$;

revoke all on function public.convert_waitlist_entry(uuid, text) from public, anon, service_role;
grant execute on function public.convert_waitlist_entry(uuid, text) to authenticated;

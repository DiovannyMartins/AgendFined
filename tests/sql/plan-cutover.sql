-- #261, fase 7 (spec 007 User Story 5, FR-017, SC-005; ADR 0013): a virada
-- troca todo trial_ends_at = 'infinity'. O antigo Grátis (inclusive quem
-- assinou e cancelou sem carência) ganha virada + 30 dias, um registro em
-- trial_grants e o e-mail da virada na fila; assinante e carência vigente
-- ficam com null. Depois disso o check impede 'infinity'.
-- Run against the local stack only (`npx supabase start`):
--   docker exec -i supabase_db_projeto psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < tests/sql/plan-cutover.sql
-- Everything runs in one transaction that is rolled back. The migration already
-- ran, so the check is dropped here to recreate the legacy 'infinity' rows.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.businesses drop constraint businesses_trial_ends_at_finite;

-- A negócio older than the plano único.
create function pg_temp.legacy_business(p_tag text, p_phone text)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'Virada.' || p_tag || '@Example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono ' || p_tag);
  insert into public.businesses (id, owner_id, name, slug, phone, timezone, trial_ends_at)
  values (v_business, v_owner, 'Negocio ' || p_tag, 'virada-261-' || p_tag, p_phone, 'America/Sao_Paulo', 'infinity');
  return v_business;
end;
$$;

create function pg_temp.add_subscription(p_business uuid, p_tag text, p_status text, p_grace interval)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.subscriptions (business_id, mp_preapproval_id, status, grace_period_end)
  values (p_business, 'mp-virada-261-' || p_tag, p_status::public.subscription_status, now() + p_grace)
  returning id into v_id;
  update public.businesses set current_subscription_id = v_id where id = p_business;
end;
$$;

create temporary table virada (tag text primary key, business_id uuid) on commit drop;

do $$
begin
  insert into virada values ('gratis', pg_temp.legacy_business('gratis', '(11) 98888-7701'));
  insert into virada values ('authorized', pg_temp.legacy_business('authorized', '11988887702'));
  insert into virada values ('cancelled-grace', pg_temp.legacy_business('cancelled-grace', '11988887703'));
  insert into virada values ('paused-grace', pg_temp.legacy_business('paused-grace', '11988887704'));
  insert into virada values ('cancelled-over', pg_temp.legacy_business('cancelled-over', '11988887705'));
  insert into virada values ('pending', pg_temp.legacy_business('pending', '11988887706'));
  -- Same telefone as 'gratis': both legacy negócios get their teste.
  insert into virada values ('same-phone', pg_temp.legacy_business('same-phone', '11988887701'));

  perform pg_temp.add_subscription((select business_id from virada where tag = 'authorized'), 'authorized', 'authorized', null);
  perform pg_temp.add_subscription((select business_id from virada where tag = 'cancelled-grace'), 'cancelled-grace', 'cancelled', interval '5 days');
  perform pg_temp.add_subscription((select business_id from virada where tag = 'paused-grace'), 'paused-grace', 'paused', interval '5 days');
  perform pg_temp.add_subscription((select business_id from virada where tag = 'cancelled-over'), 'cancelled-over', 'cancelled', interval '-1 day');
  perform pg_temp.add_subscription((select business_id from virada where tag = 'pending'), 'pending', 'pending', null);
end;
$$;

-- An old updated_at, to see that the virada keeps it.
alter table public.businesses disable trigger set_updated_at_businesses;
update public.businesses set updated_at = '2026-01-01T00:00:00Z' where id in (select business_id from virada);
alter table public.businesses enable trigger set_updated_at_businesses;

-- A negócio already on a finite teste is not touched.
do $$
declare
  v_owner uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'virada.finito@example.test');
  insert into public.profiles (id, display_name) values (v_owner, 'Dono finito');
  insert into public.businesses (owner_id, name, slug, phone, timezone, trial_ends_at)
  values (v_owner, 'Negocio finito', 'virada-261-finito', '11988887709', 'America/Sao_Paulo', '2027-01-15T12:00:00Z');
  insert into virada select 'finite', id from public.businesses where slug = 'virada-261-finito';
end;
$$;

do $$
declare
  v record;
  v_result record;
  v_grants_before integer := (select count(*) from public.trial_grants);
begin
  select * into v_result from private.apply_plan_cutover();
  -- Only this test's rows are 'infinity' (the migration converted the rest).
  if v_result.trials_granted <> 4 or v_result.trials_cleared <> 3 then
    raise exception 'expected 4 testes and 3 null, got % and %', v_result.trials_granted, v_result.trials_cleared;
  end if;

  for v in
    select x.tag, b.trial_ends_at, b.updated_at, b.phone, b.owner_id, b.id
    from virada x join public.businesses b on b.id = x.business_id
  loop
    if v.tag in ('gratis', 'cancelled-over', 'pending', 'same-phone') then
      if v.trial_ends_at is distinct from now() + interval '30 days' then
        raise exception '%: expected the virada + 30 days, got %', v.tag, v.trial_ends_at;
      end if;
      if not exists (
        select 1 from public.trial_grants g
        where g.business_id = v.id
          and g.source = 'migration'
          and g.phone_hash = private.trial_phone_hash(v.phone)
          and g.email_hash = (select private.trial_email_hash(u.email) from auth.users u where u.id = v.owner_id)
      ) then
        raise exception '%: expected a trial_grants row with source migration and the signup hashes', v.tag;
      end if;
      if not exists (
        select 1 from public.plan_cutover_notices n
        where n.business_id = v.id and n.trial_ends_at = v.trial_ends_at and n.sent_at is null
      ) then
        raise exception '%: expected the e-mail da virada queued', v.tag;
      end if;
      if not public.business_has_access(v.id) then
        raise exception '%: expected access during the teste', v.tag;
      end if;
    elsif v.tag in ('authorized', 'cancelled-grace', 'paused-grace') then
      if v.trial_ends_at is not null then
        raise exception '%: expected null (access from the assinatura), got %', v.tag, v.trial_ends_at;
      end if;
      if exists (select 1 from public.trial_grants g where g.business_id = v.id)
        or exists (select 1 from public.plan_cutover_notices n where n.business_id = v.id) then
        raise exception '%: an assinante gets no teste and no e-mail', v.tag;
      end if;
      if not public.business_has_access(v.id) then
        raise exception '%: expected access from the assinatura', v.tag;
      end if;
    else
      if v.trial_ends_at <> '2027-01-15T12:00:00Z' then
        raise exception 'finite: expected the teste untouched, got %', v.trial_ends_at;
      end if;
      if exists (select 1 from public.plan_cutover_notices n where n.business_id = v.id) then
        raise exception 'finite: expected no e-mail da virada';
      end if;
    end if;

    if v.tag <> 'finite' and v.updated_at <> '2026-01-01T00:00:00Z' then
      raise exception '%: updated_at changed to %', v.tag, v.updated_at;
    end if;
  end loop;

  if (select count(*) from public.trial_grants) - v_grants_before <> 4 then
    raise exception 'expected exactly 4 new trial_grants rows';
  end if;
  if exists (select 1 from public.businesses where trial_ends_at = 'infinity') then
    raise exception 'no ''infinity'' may be left';
  end if;

  -- Running again changes nothing.
  select * into v_result from private.apply_plan_cutover();
  if v_result.trials_granted <> 0 or v_result.trials_cleared <> 0 then
    raise exception 'second run: expected nothing, got % and %', v_result.trials_granted, v_result.trials_cleared;
  end if;
  if (select count(*) from public.trial_grants) - v_grants_before <> 4 then
    raise exception 'second run: trial_grants changed';
  end if;

  -- The trigger that updates updated_at is back on.
  update public.businesses set name = 'Negocio gratis 2'
  where id = (select business_id from virada where tag = 'gratis');
  if (select updated_at from public.businesses where id = (select business_id from virada where tag = 'gratis'))
    = '2026-01-01T00:00:00Z' then
    raise exception 'set_updated_at_businesses must be enabled again';
  end if;
end;
$$;

-- Nobody but the migration runs the virada.
do $$
begin
  if has_function_privilege('service_role', 'private.apply_plan_cutover()', 'execute')
    or has_function_privilege('authenticated', 'private.apply_plan_cutover()', 'execute')
    or has_function_privilege('anon', 'private.apply_plan_cutover()', 'execute') then
    raise exception 'private.apply_plan_cutover() must not be executable by API roles';
  end if;
  if has_function_privilege('authenticated', 'public.claim_plan_cutover_notices(integer, integer)', 'execute')
    or has_function_privilege('anon', 'public.claim_plan_cutover_notices(integer, integer)', 'execute')
    or has_function_privilege('authenticated', 'public.mark_plan_cutover_notice_sent(uuid, uuid)', 'execute') then
    raise exception 'the e-mail da virada RPCs are service_role only';
  end if;
  if has_table_privilege('authenticated', 'public.plan_cutover_notices', 'select') then
    raise exception 'plan_cutover_notices is service_role only';
  end if;
end;
$$;

-- 'infinity' does not come back.
alter table public.businesses
  add constraint businesses_trial_ends_at_finite
  check (trial_ends_at is null or isfinite(trial_ends_at));

do $$
begin
  begin
    update public.businesses set trial_ends_at = 'infinity'
    where id = (select business_id from virada where tag = 'finite');
    raise exception 'expected the check to refuse ''infinity''';
  exception when check_violation then
    null;
  end;
end;
$$;

rollback;

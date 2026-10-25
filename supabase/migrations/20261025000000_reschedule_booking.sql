-- ===========================================================================
-- #194: remarcação. Until now the cliente had to cancel and book again (and
-- could lose the old horário), and the dono could only cancel, which is final.
--
-- Remarcar moves the same reserva (ADR 0010): status stays confirmed, and the
-- public_code, the cancellation token digest (ADR 0005), the snapshot
-- (ADR 0002), the customer and the Google Calendar event (deterministic id)
-- are kept. Only start_at/end_at change; end_at keeps the snapshot duration.
--
--   * booking_reschedules records every move (from, to, who), the reserva's
--     history. bookings.rescheduled_at stamps the latest one.
--   * reschedule_owner_booking: the dono's dashboard (owner_id = auth.uid()
--     and MFA), with the rules of create_owner_booking: start in the future
--     and the plan limit; no antecedência nor configured janela; the encaixe
--     outside the faixas is confirmed in the Server Action.
--   * reschedule_booking_by_public_code: the cliente with the private link,
--     service_role only, with the rules of create_booking: antecedência,
--     effective janela, active negócio and service. The faixas are checked in
--     the Server Action, as for a public reserva.
--   * Both refuse a reserva that is no longer confirmed or already started:
--     like the cancellation (#141), the atendimento's desfecho belongs to the
--     negócio once it begins.
--   * Bloqueios and sobreposição stay in the database: the update fires
--     prevent_booking_block_overlap (BOOKING_BLOCK_OVERLAP) and the exclusion
--     constraint bookings_no_overlap (23P01, ADR 0003). The reserva's own old
--     range never conflicts with the new one, it is the same row.
--   * The reminder is reset: a reserva moved to another day gets a new
--     "Lembrete", but one moved inside the reminder lead already has the
--     remarcação e-mail, sent moments ago, as its reminder. So
--     get_due_booking_reminders now compares the lead with the latest move
--     (coalesce(rescheduled_at, created_at)), as #144 did with created_at.
--
-- The dono still writes only status and the cancellation columns
-- (20261015000000_bookings_owner_write_guard): rescheduled_at gets no column
-- grant, and start_at/end_at change only through these RPCs.
-- ===========================================================================
alter table public.bookings add column rescheduled_at timestamptz;

create table public.booking_reschedules (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  previous_start_at timestamptz not null,
  previous_end_at timestamptz not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  rescheduled_by text not null
    constraint booking_reschedules_rescheduled_by_check check (rescheduled_by in ('customer', 'business')),
  created_at timestamptz not null default now()
);

create index booking_reschedules_booking_idx on public.booking_reschedules (booking_id, created_at desc);
create index booking_reschedules_business_idx on public.booking_reschedules (business_id);

alter table public.booking_reschedules enable row level security;

create policy booking_reschedules_owner_select on public.booking_reschedules for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy require_verified_mfa on public.booking_reschedules as restrictive for all to authenticated
  using ((select private.mfa_aal_allowed())) with check ((select private.mfa_aal_allowed()));

-- Only the RPCs below write the history (20261017020000: a new public table
-- grants its Data API roles in the migration that creates it).
revoke all on table public.booking_reschedules from anon, authenticated;
grant select on table public.booking_reschedules to authenticated;
grant select, insert, update, delete on table public.booking_reschedules to service_role;

-- Shared by both RPCs, which already hold the business and the booking locks.
create or replace function private.apply_booking_reschedule(
  p_booking public.bookings,
  p_start_at timestamptz,
  p_rescheduled_by text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  update public.bookings
  set start_at = p_start_at,
      end_at = p_start_at + make_interval(mins => p_booking.duration_minutes_snapshot),
      rescheduled_at = now(),
      reminder_sent_at = null,
      reminder_claimed_at = null,
      reminder_claim_token = null,
      updated_at = now()
  where id = p_booking.id
  returning * into v_booking;

  insert into public.booking_reschedules (
    booking_id, business_id, previous_start_at, previous_end_at,
    start_at, end_at, rescheduled_by
  )
  values (
    v_booking.id, v_booking.business_id, p_booking.start_at, p_booking.end_at,
    v_booking.start_at, v_booking.end_at, p_rescheduled_by
  );

  return v_booking;
end;
$$;

revoke all on function private.apply_booking_reschedule(public.bookings, timestamptz, text)
  from public, anon, authenticated, service_role;

create or replace function public.reschedule_owner_booking(
  p_booking_id uuid,
  p_start_at timestamptz
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_booking public.bookings;
  v_plan_window_days integer;
begin
  if not private.mfa_aal_allowed() then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  -- Same row lock as create_owner_booking.
  select * into v_business
  from public.businesses
  where owner_id = (select auth.uid())
  for update;

  if v_business is null then raise exception 'BUSINESS_NOT_FOUND'; end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
    and business_id = v_business.id
  for update;

  if v_booking is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'BOOKING_NOT_CONFIRMED'; end if;
  if v_booking.start_at <= now() then raise exception 'BOOKING_ALREADY_STARTED'; end if;

  if p_start_at <= now() then
    raise exception 'BOOKING_IN_PAST';
  end if;
  if p_start_at = v_booking.start_at then
    raise exception 'BOOKING_SAME_START';
  end if;
  -- Computed apart: PL/pgSQL ends an IF condition at the first THEN, the CASE's.
  v_plan_window_days := case when v_business.plan = 'pro' then 365 else 90 end;
  if (p_start_at at time zone v_business.timezone)::date >
     (now() at time zone v_business.timezone)::date + v_plan_window_days then
    raise exception 'BOOKING_OUTSIDE_PLAN_WINDOW';
  end if;

  return private.apply_booking_reschedule(v_booking, p_start_at, 'business');
end;
$$;

revoke all on function public.reschedule_owner_booking(uuid, timestamptz)
  from public, anon, service_role;
grant execute on function public.reschedule_owner_booking(uuid, timestamptz)
  to authenticated;

-- Every failure before the digest matches has the same answer, like
-- cancel_booking_by_public_code (ADR 0005). The specific errors after it only
-- reveal something to whoever already holds the token.
create or replace function public.reschedule_booking_by_public_code(
  p_code text,
  p_cancel_token_hash text,
  p_start_at timestamptz
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
  v_service public.services;
  v_booking public.bookings;
  v_effective_window_days integer;
begin
  if p_cancel_token_hash is null or p_cancel_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'RESCHEDULE_REJECTED';
  end if;

  select business_id into v_business_id
  from public.bookings
  where public_code = p_code
    and cancel_token_hash = p_cancel_token_hash;

  if v_business_id is null then raise exception 'RESCHEDULE_REJECTED'; end if;

  -- Business before booking, the order every booking write takes.
  select * into v_business
  from public.businesses
  where id = v_business_id
  for update;

  select * into v_booking
  from public.bookings
  where public_code = p_code
    and cancel_token_hash = p_cancel_token_hash
  for update;

  if v_booking is null or v_booking.status <> 'confirmed' then
    raise exception 'RESCHEDULE_REJECTED';
  end if;
  if v_booking.start_at <= now() then
    raise exception 'BOOKING_ALREADY_STARTED';
  end if;
  if not v_business.is_active then raise exception 'BUSINESS_INACTIVE'; end if;

  if p_start_at = v_booking.start_at then
    raise exception 'BOOKING_SAME_START';
  end if;
  if p_start_at < now() + make_interval(mins => v_business.min_notice_minutes) then
    raise exception 'BOOKING_BEFORE_MIN_NOTICE';
  end if;
  v_effective_window_days := least(
    v_business.booking_window_days::integer,
    case when v_business.plan = 'pro' then 365 else 90 end
  );
  if (p_start_at at time zone v_business.timezone)::date >
     (now() at time zone v_business.timezone)::date + v_effective_window_days then
    raise exception 'BOOKING_OUTSIDE_PLAN_WINDOW';
  end if;

  -- The service is locked as in create_booking, which serializes with its
  -- deletion (ADR 0002). A deleted or inactive service is not offered anymore.
  select * into v_service
  from public.services
  where id = v_booking.service_id
    and business_id = v_business.id
  for update;

  if v_service is null or not v_service.is_active then
    raise exception 'SERVICE_INACTIVE';
  end if;

  return private.apply_booking_reschedule(v_booking, p_start_at, 'customer');
end;
$$;

revoke all on function public.reschedule_booking_by_public_code(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reschedule_booking_by_public_code(text, text, timestamptz)
  to service_role;

-- Same signature, result, claim, posture and grants as 20261022000000; only the
-- lead is compared with the latest move instead of created_at.
create or replace function public.get_due_booking_reminders(
  p_lead_minutes integer default 1440
)
returns table (
  id uuid,
  business_id uuid,
  business_name text,
  business_slug text,
  business_timezone text,
  business_phone text,
  customer_name_snapshot text,
  customer_email_snapshot text,
  service_name_snapshot text,
  start_at timestamptz,
  public_code text,
  reminder_claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead interval := make_interval(mins => greatest(1, least(p_lead_minutes, 1440)));
begin
  return query
  with candidates as (
    select b.id
    from public.bookings b
    join public.businesses bus on bus.id = b.business_id
    where bus.plan = 'pro'
      and b.status = 'confirmed'
      and b.reminder_sent_at is null
      and b.customer_email_snapshot is not null
      and b.customer_email_snapshot <> ''
      and b.start_at > now()
      and b.start_at <= now() + v_lead
      and coalesce(b.rescheduled_at, b.created_at) < b.start_at - v_lead
      and (b.reminder_claimed_at is null or b.reminder_claimed_at < now() - interval '15 minutes')
    order by b.start_at asc
    limit 50
    for update of b skip locked
  ), claimed as (
    update public.bookings b
    set reminder_claimed_at = now(), reminder_claim_token = extensions.gen_random_uuid()
    from candidates c
    where b.id = c.id
    returning b.*
  )
  select
    b.id,
    b.business_id,
    bus.name,
    bus.slug,
    bus.timezone,
    bus.phone,
    b.customer_name_snapshot,
    b.customer_email_snapshot,
    b.service_name_snapshot,
    b.start_at,
    b.public_code,
    b.reminder_claim_token
  from claimed b
  join public.businesses bus on bus.id = b.business_id
  order by b.start_at asc;
end;
$$;

revoke all on function public.get_due_booking_reminders(integer) from public, anon, authenticated;
grant execute on function public.get_due_booking_reminders(integer) to service_role;

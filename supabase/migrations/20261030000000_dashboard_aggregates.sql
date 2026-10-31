-- Agregações do painel no banco (#215). O PostgREST corta respostas em 1000
-- linhas (max_rows), então contar reservas em JS dava números errados acima
-- disso. As duas funções são security invoker: o RLS de bookings continua
-- escopando as linhas ao dono, e só o papel authenticated pode chamá-las.

-- Serviços: total de reservas por serviço (decide "excluir" x "arquivar") e
-- quantas ainda estão agendadas à frente.
create or replace function public.service_booking_counts(p_business_id uuid)
returns table (service_id uuid, booking_count bigint, scheduled_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    b.service_id,
    count(*)::bigint,
    (count(*) filter (where b.status = 'confirmed' and b.end_at > now()))::bigint
  from public.bookings b
  where b.business_id = p_business_id
    and b.service_id is not null
  group by b.service_id;
$$;

revoke all on function public.service_booking_counts(uuid) from public, anon, service_role;
grant execute on function public.service_booking_counts(uuid) to authenticated;

-- Relatórios: contagem e faturamento por status e serviço (snapshot) no
-- período semiaberto [p_from, p_to). O cálculo das taxas e do serviço mais
-- vendido continua em lib/reports/reports.ts, sobre estes grupos.
create or replace function public.billing_report_groups(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  status public.booking_status,
  service_name_snapshot text,
  booking_count bigint,
  revenue_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    b.status,
    b.service_name_snapshot,
    count(*)::bigint,
    coalesce(sum(b.price_cents_snapshot), 0)::bigint
  from public.bookings b
  where b.business_id = p_business_id
    and b.start_at >= p_from
    and b.start_at < p_to
  group by b.status, b.service_name_snapshot;
$$;

revoke all on function public.billing_report_groups(uuid, timestamptz, timestamptz) from public, anon, service_role;
grant execute on function public.billing_report_groups(uuid, timestamptz, timestamptz) to authenticated;

-- Clientes: reservas de cada cliente da página exibida. O count embutido do
-- PostgREST (bookings(count)) não passa pelo SELECT por coluna de bookings
-- (20261027000000_security_hardening_grants_triggers).
create or replace function public.customer_booking_counts(p_business_id uuid, p_customer_ids uuid[])
returns table (customer_id uuid, booking_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.customer_id, count(b.id)::bigint
  from public.bookings b
  where b.business_id = p_business_id
    and b.customer_id = any (p_customer_ids)
  group by b.customer_id;
$$;

revoke all on function public.customer_booking_counts(uuid, uuid[]) from public, anon, service_role;
grant execute on function public.customer_booking_counts(uuid, uuid[]) to authenticated;

-- Sync incremental do Google Calendar (#220). Cada linha guarda a versão
-- (bookings.updated_at) da reserva que já está no calendário daquela conexão.
-- O cron só reenvia a reserva cuja updated_at mudou desde então; o sync manual
-- e o da conexão continuam reenviando tudo. Uma tabela à parte evita gravar em
-- bookings, cujo trigger set_updated_at mudaria a própria versão marcada.
-- Como google_calendar_connections, a tabela é só do service_role.

create table public.google_calendar_booking_syncs (
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (connection_id, booking_id)
);

alter table public.google_calendar_booking_syncs enable row level security;
revoke all on table public.google_calendar_booking_syncs from anon, authenticated;
grant select, insert, update, delete on table public.google_calendar_booking_syncs to service_role;

comment on table public.google_calendar_booking_syncs is
  'Server-only: versão (bookings.updated_at) de cada reserva já enviada ao Google Calendar da conexão.';

-- Real Google Calendar OAuth connection for the owner calendar.
-- Tokens are encrypted by the Next.js server before persistence. The table is
-- intentionally service_role-only: even an authenticated Supabase client must
-- never be able to read refresh tokens or their ciphertext.

create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  google_email text not null,
  calendar_id text not null default 'primary',
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  token_expires_at timestamptz not null,
  scope text not null,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_google_calendar_connections_sync
  on public.google_calendar_connections (updated_at);

alter table public.google_calendar_connections enable row level security;
revoke all on table public.google_calendar_connections from anon, authenticated;
grant select, insert, update, delete on public.google_calendar_connections to service_role;

drop trigger if exists set_updated_at_google_calendar_connections on public.google_calendar_connections;
create trigger set_updated_at_google_calendar_connections
  before update on public.google_calendar_connections
  for each row execute function public.set_updated_at();

comment on table public.google_calendar_connections is
  'Server-only OAuth credentials for the owner Google Calendar. Ciphertexts are encrypted by the application.';

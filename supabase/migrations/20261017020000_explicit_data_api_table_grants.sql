-- The earlier migrations relied on the cloud default that grants every new
-- public table to the Data API roles. supabase/config.toml opts out
-- (auto_expose_new_tables = false), so a database built from these migrations
-- alone denied service_role and authenticated on every table that never got an
-- explicit grant. This states those grants.
--
-- Production already holds a superset of them, so applying this there changes
-- nothing. authenticated gets only the commands its RLS policies permit; the
-- owner reaches every other write through service_role or SECURITY DEFINER RPCs.
-- anon stays without table access (20260929000000_security_response_hardening).
--
-- Already explicit and left as they are: subscriptions, billing_attempts,
-- billing_reconciliation_claims, security_usage_daily,
-- google_calendar_connections, and the column-level update on bookings
-- (20261015000000_bookings_owner_write_guard). public has no sequences: every
-- key is a uuid.
--
-- A new public table must grant its Data API roles in the migration that
-- creates it.

grant select, insert, update, delete on table
  public.profiles,
  public.businesses,
  public.services,
  public.availability,
  public.availability_blocks,
  public.customers,
  public.bookings,
  public.booking_rate_limits,
  public.waitlist_entries
to service_role;

grant select, insert, update, delete on table
  public.profiles,
  public.businesses,
  public.services,
  public.availability,
  public.availability_blocks
to authenticated;

grant select, insert on table public.customers to authenticated;

grant select on table
  public.bookings,
  public.waitlist_entries
to authenticated;

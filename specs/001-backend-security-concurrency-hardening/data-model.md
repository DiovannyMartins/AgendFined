# Data Model Changes

## Reminder claim state

The `bookings` table gains `reminder_claimed_at timestamptz` and `reminder_claim_token uuid`.

- `reminder_sent_at IS NOT NULL` means the reminder was successfully marked sent.
- A non-null claim is active while it is newer than the lease timeout.
- The claim RPC returns only due, confirmed, Pro-plan, e-mail-bearing rows whose claim is acquired atomically.
- `set_booking_reminders_sent` clears the claim only for the matching token, preventing a stale worker from fencing a newer claim.

## Public catalog RPCs

- `get_public_business(p_slug text)` returns `id`, `name`, `slug`, and `description` for one active business.
- `get_public_services(p_business_id uuid)` returns `id`, `name`, `description`, `duration_minutes`, and `price_cents` for active services of one active business.
- Both functions are security-definer, use `set search_path = ''`, fully qualify relations, and are executable only by `anon`, `authenticated`, and `service_role` through the function contract.
- Direct anonymous/authenticated table SELECT is revoked after the RPCs are installed.

## Atomic service delete

`delete_service_if_unused(p_business_id, p_service_id, p_now)` locks the service row, checks future confirmed bookings under the same transaction, and deletes only when no such booking exists. It returns a boolean and is service-role-only; the Server Action calls it with the admin client after checking the authenticated business.

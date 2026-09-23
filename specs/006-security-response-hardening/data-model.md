# Data Model: Security Response Hardening

## Booking cancellation capability

Existing entity: `public.bookings`

| Field | Type | Nullability | Meaning |
|---|---|---|---|
| `cancel_token_hash` | `text` | nullable | Lowercase SHA-256 hex digest of the private cancellation token |

Rules:

- New bookings require a 64-character lowercase hexadecimal digest.
- Existing rows remain null and cannot use self-service cancellation.
- Raw tokens are never stored or returned by lookup routines.
- Cancellation locks the row, requires a digest match and `confirmed` status, then transitions to `cancelled`.

## Public booking identifier

`public_code` remains eight Crockford-base32 characters for compatibility. Its generator uses cryptographic bytes, uniqueness remains enforced, and it identifies but never authorizes.

## Privilege model

Protected customer, booking, rate-limit, business configuration, availability, billing, and subscription tables expose no direct privileges to `anon`. Public behavior is available only through reviewed routines or service-role server actions.

```text
confirmed --[correct private digest]--> cancelled
confirmed --[missing/wrong token]-----> confirmed
cancelled --[any token]---------------> cancelled (rejected)
```

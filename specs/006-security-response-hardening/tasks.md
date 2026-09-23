---
description: "Task list for security response hardening"
---

# Tasks: Security Response Hardening

**Input**: Design documents from `/specs/006-security-response-hardening/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required by FR-016 and the repository constitution.

## Phase 1: Setup

- [X] T001 Review the current booking, cancellation, billing, auth callback, Turnstile, Next.js configuration, Supabase configuration, migrations, and security tests.
- [X] T002 Read the installed Next.js 16 header, CSP, and framework disclosure guidance before editing `next.config.ts`.
- [X] T003 Create and validate the Spec Kit artifacts under `specs/006-security-response-hardening/`.

## Phase 2: Foundational Database Contract

- [X] T004 Create the forward migration with the Supabase CLI and order it after existing migrations in `supabase/migrations/20260929000000_security_response_hardening.sql`.
- [X] T005 Add `bookings.cancel_token_hash`, cryptographic public-code generation, digest-required booking creation/cancellation RPCs, and explicit routine grants in the migration.
- [X] T006 Revoke direct `anon` privileges from protected base tables and harden future default privileges without removing reviewed RPC access.
- [X] T007 Update generated/static Supabase typings in `lib/supabase/database-types.ts` for the revised column and RPC contracts.

## Phase 3: User Story 1 — Private cancellation capability (P1)

**Goal**: A public code identifies a booking but cannot authorize cancellation.

**Independent Test**: Missing/wrong tokens fail generically; the issued token succeeds; lookups never return token material.

### Tests

- [X] T008 [P] [US1] Replace derived-token tests with generation/hash/verification tests in `lib/bookings/cancel.test.ts`.
- [X] T009 [P] [US1] Update booking/cancellation integration tests to require private token digests in `tests/integration/booking.integration.ts`, `tests/integration/cancel-waitlist.integration.ts`, and related helpers.
- [X] T010 [P] [US1] Update booking browser coverage for separate code/token values in `tests/e2e/booking.spec.ts`.

### Implementation

- [X] T011 [US1] Implement random token generation and SHA-256 hashing in `lib/bookings/cancel.ts`.
- [X] T012 [US1] Generate the token before the booking RPC, pass its digest, return the raw token once, and provide the private email link in `lib/booking/actions.ts` and `lib/email/booking-confirmation.ts`.
- [X] T013 [US1] Carry the private token into the confirmation URL and stop deriving it in `app/[slug]/booking-widget.tsx` and `app/[slug]/confirmacao/page.tsx`.
- [X] T014 [US1] Hash and submit the supplied token to the authoritative cancellation RPC with one generic rejection in `lib/booking/actions.ts`.

## Phase 4: User Story 2 — Minimal external responses (P1)

**Goal**: External callers receive only deliberate responses and cannot enumerate protected base-table endpoints.

**Independent Test**: Canary provider/database errors never appear; empty auth callback fails; anonymous base-table calls are denied.

### Tests

- [X] T015 [P] [US2] Update billing unit tests with raw-error canaries in `lib/billing/*.test.ts`.
- [X] T016 [P] [US2] Add auth callback tests for missing/incomplete credentials and trusted error origin in `app/auth/callback/route.test.ts`.
- [X] T017 [P] [US2] Extend `tests/integration/security.integration.ts` to assert protected table denials and explicit public RPC availability.

### Implementation

- [X] T018 [US2] Replace raw upstream/persistence error messages in `lib/billing/start-upgrade.ts`, `retry-upgrade.ts`, and `cancel-subscription.ts`.
- [X] T019 [US2] Reject credential-free/incomplete callbacks and use trusted origins consistently in `app/auth/callback/route.ts`.
- [X] T020 [US2] Align local Auth policy in `supabase/config.toml` with confirmation, password, and secure-change requirements.

## Phase 5: User Story 3 — Browser and automated abuse defenses (P2)

**Goal**: Production mutations fail closed without a correctly bound challenge and browsers enforce defensive policies.

**Independent Test**: Wrong/missing configuration/action/hostname is rejected and configured headers match on every path.

### Tests

- [X] T021 [P] [US3] Expand `lib/booking/anti-bot.test.ts` for production fail-closed behavior, action, hostname, and remote address.
- [X] T022 [P] [US3] Add Next.js security configuration tests for headers and framework disclosure in `lib/security/next-config.test.ts`.

### Implementation

- [X] T023 [US3] Harden verification inputs and response binding in `lib/booking/anti-bot.ts` and its callers in `lib/booking/actions.ts`.
- [X] T024 [US3] Add action support to `components/turnstile-widget.tsx`, `app/[slug]/booking-widget.tsx`, and `app/[slug]/consultar/consultar-form.tsx`.
- [X] T025 [US3] Add CSP and security headers and disable `X-Powered-By` in `next.config.ts`.

## Phase 6: Validation and Documentation

- [X] T026 Regenerate or verify all affected contracts and remove obsolete `CANCEL_TOKEN_SECRET` code references.
- [X] T027 Run focused unit tests, full unit suite, lint, typecheck, and production build.
- [X] T028 Run applicable Node 22 integration/security tests when the configured target is safe, otherwise record the external migration prerequisite.
- [X] T029 Update `quickstart.md`, task checkboxes, and final security findings with exact verification results.

## Dependencies & Execution Order

1. Setup is complete.
2. The database contract (T004–T007) defines the invariant used by US1.
3. US1 closes the unauthorized mutation finding.
4. US2 and US3 can follow independently after the database contract.
5. Validation runs only after all implementation tasks.

## Implementation Strategy

Implement the highest-risk cancellation capability first, then close information disclosure and anonymous endpoint exposure, then browser/automation defenses. Tests are updated alongside each boundary and the final quality gates validate the combined change.

# Tasks: Backend Security and Consistency Hardening

**Input**: Design documents in `specs/001-backend-security-concurrency-hardening/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`

## Phase 1: Foundational database contracts

- [x] T001 [US1] Add the generated migration `supabase/migrations/20260928000000_backend_security_concurrency_hardening.sql` with explicit public catalog RPCs and revoke anonymous/authenticated base-table SELECT.
- [x] T002 [US2] In the same migration, restore `create_booking` with `set search_path = ''`, active-business validation, service-row locking, and fully-qualified identifiers.
- [x] T003 [US2] Add atomic `delete_service_if_unused` and reminder claim/mark RPCs with least-privilege grants and short lease semantics.
- [x] T004 [P] [US1] Add/adjust typed database contracts in `lib/supabase/database-types.ts` for every new RPC and reminder claim field.

## Phase 2: User Story 1 — Public isolation

- [x] T005 [US1] Replace public `businesses`/`services` `select(*)` calls in `app/[slug]/page.tsx` and `app/[slug]/consultar/page.tsx` with the allowlisted RPCs.
- [x] T006 [US1] Validate confirmation code and slug, enforce fail-closed consultation rate limiting, and prevent deriving a cancellation capability for a mismatched tenant in `app/[slug]/confirmacao/page.tsx`.
- [x] T007 [US1] Ensure public lookup/cancellation inputs and auth-independent server actions use bounded Zod schemas and generic failure messages in `lib/booking/actions.ts` and `lib/validation/schemas.ts`.
- [x] T008 [P] [US1] Add unit/regression coverage for malformed code, wrong slug, limiter failure, and public catalog field allowlisting. (Existing lookup validation plus updated integration coverage.)

## Phase 3: User Story 2 — Atomic mutations

- [x] T009 [US2] Change `updateBookingStatus` to a compare-and-swap update keyed by the observed status, returning a conflict instead of overwriting concurrent work in `lib/bookings/actions.ts`.
- [x] T010 [US2] Call the atomic service-delete RPC from `lib/services/actions.ts` and map scheduled-booking/conflict/database errors into `ActionResult`.
- [x] T011 [US2] Preserve the existing booking exclusion constraint and map `23P01`/conflict errors consistently in create/waitlist paths.
- [x] T012 [P] [US2] Add regression tests for stale status updates and service-delete/create races where the integration harness supports them. (Existing integration concurrency/invariant coverage passes.)

## Phase 4: User Story 3 — Explicit failures and worker hardening

- [x] T013 [US3] Make `getSlotsForDate` fail explicitly for business/service/interval/block/booking read errors and handle the error state in `app/[slug]/booking-widget.tsx`.
- [x] T014 [US3] Validate Edge Function env vars and candidate payloads, use bounded claimed candidates, fence mark-sent updates, and return non-2xx on DB mark failures in `supabase/functions/booking-reminders/index.ts`.
- [x] T015 [US3] Restrict auth callback redirects to configured trusted origins and align reconciliation cron secret naming/constant-time comparison in `app/auth/callback/route.ts` and `app/api/internal/reconciliation/route.ts`.
- [x] T016 [P] [US3] Add fail-closed env validation, bounded auth/AI inputs, and complete relevant `revalidatePath` calls in `lib/supabase/admin.ts`, `lib/auth/actions.ts`, `lib/services/search.ts`, `lib/customers/search.ts`, and `lib/business/actions.ts`. (`server-only` package was not installed and was not added as an unnecessary dependency.)
- [x] T017 [P] [US3] Add unit tests for availability DB failure, redirect origin, cron secret, and reminder response/error mapping. (Existing route/action suites plus integration reminder coverage pass.)

## Phase 5: Verification and convergence

- [x] T018 Run `npx vitest run --project unit` and fix regressions.
- [x] T019 Run `npm run typecheck` and fix all type errors, including generated Supabase RPC types.
- [x] T020 Run `npm run lint` and fix lint errors.
- [x] T021 Run SQL/migration validation and integration tests with Node 22 when the linked Supabase environment is available. (Remote schema lint and 85 integration tests passed.)
- [x] T022 Review the diff against `spec.md`, mark completed tasks, and document any remote deployment step intentionally left for the operator. Remote migration and Edge Function deployment completed; secrets remain operator configuration.

## Dependencies and execution order

T001–T004 block all later work. T005–T008 form the P1 public isolation slice. T009–T012 depend on the database contracts. T013–T017 can proceed after the contracts and are otherwise parallel by file. T018–T022 are final gates.

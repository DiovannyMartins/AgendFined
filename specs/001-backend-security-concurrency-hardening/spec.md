# Feature Specification: Backend Security and Consistency Hardening

**Feature Branch**: `001-backend-security-concurrency-hardening`

**Created**: 2026-09-19

**Status**: Implemented and deployed; reminder secrets pending configuration

**Input**: User request to correct all critical and important findings from the TypeSafe/Jev backend review, plus the directly related suggestions that prevent recurrence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Public data and cancellation are tenant-bound (Priority: P1)

As a public visitor, I can consult a booking only for the business slug and a valid public code, while public catalog responses expose only fields required by the booking flow.

**Why this priority**: The current confirmation flow can disclose booking data and a cancellation capability through an unvalidated short code, and public PostgREST policies expose internal business fields.

**Independent Test**: Exercise confirmation with malformed, rate-limited, wrong-slug, and valid codes; query the public catalog through the supported API and verify no owner/plan/configuration fields are available.

**Acceptance Scenarios**:

1. **Given** a code that is malformed, unknown, or paired with another business slug, **When** confirmation is requested, **Then** the response is a generic not-found result and never returns booking or cancellation data.
2. **Given** repeated confirmation attempts from one client, **When** the consultation limit is exceeded or the limiter fails, **Then** the request is rejected without revealing whether a code exists.
3. **Given** the public booking page, **When** its catalog is loaded, **Then** only allowlisted business and service fields are returned.

---

### User Story 2 - Booking and service mutations remain atomic (Priority: P1)

As a business operator and customer, I can create, convert, update, or delete booking data without races causing double-booking, invalid status transitions, or deletion of a service still needed by a future booking.

**Why this priority**: Availability and booking correctness are domain invariants that cannot be repaired reliably in the UI after a concurrent request.

**Independent Test**: Run concurrent booking/status/delete scenarios against the database and assert one deterministic outcome, with conflicts mapped to stable application errors.

**Acceptance Scenarios**:

1. **Given** two overlapping booking attempts, **When** both reach the database, **Then** the exclusion/transactional guarantees allow at most one active booking.
2. **Given** a booking status read by two concurrent actions, **When** both try incompatible transitions, **Then** only the compare-and-swap winner succeeds.
3. **Given** a service with future bookings, **When** deletion is requested concurrently with booking creation, **Then** deletion is rejected atomically.

---

### User Story 3 - Failures are explicit across Next.js and the Edge worker (Priority: P1)

As a user or operator, I receive an explicit failure when Supabase, an RPC, cache revalidation, or the reminder worker fails; successful responses never hide a partial failure.

**Why this priority**: Silent empty availability and duplicate/misreported reminders turn infrastructure failures into incorrect business behavior.

**Independent Test**: Mock each boundary failure and verify the Server Action, Route Handler, client state, and Edge response preserve a stable error contract.

**Acceptance Scenarios**:

1. **Given** a database read fails during availability lookup, **When** the client requests slots, **Then** the UI receives an error state instead of an empty calendar.
2. **Given** two reminder invocations overlap, **When** candidates are claimed, **Then** each booking is sent at most once and marking failures are reported non-successfully.
3. **Given** an authenticated mutation succeeds, **When** its data changes, **Then** all affected Next.js paths are revalidated.

---

### Edge Cases

- The public code contains lowercase, whitespace, invalid Crockford characters, or excessive length.
- A valid public code belongs to a different business slug.
- The rate limiter is unavailable, the service role key is missing, or a Supabase query times out.
- Two reminder invocations claim the same window, or one worker crashes after claiming and before sending.
- A service deletion races with a booking creation or waitlist conversion.
- A status transition races with another transition based on an earlier state.
- A cache revalidation path is not the current route being displayed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every public booking lookup MUST validate the public code, bind the result to the requested business slug, and apply a fail-closed consultation limit.
- **FR-002**: Public catalog access MUST expose only the minimum allowlisted fields through a controlled database contract; base-table PostgREST access MUST NOT expose internal business data.
- **FR-003**: Server Actions and Route Handlers MUST validate untrusted input with the existing Zod schemas or equivalent bounded schemas and enforce authorization inside the server boundary.
- **FR-004**: Booking creation, waitlist conversion, service deletion, and booking status updates MUST preserve their invariants under concurrent transactions.
- **FR-005**: Reminder processing MUST validate its input, claim work atomically, use a bounded batch, and return a failure when marking sent state fails.
- **FR-006**: Supabase errors MUST be preserved as explicit domain errors across RPC, Server Action, Route Handler, and client UI boundaries; infrastructure failure MUST NOT be represented as an empty successful result.
- **FR-007**: Next.js mutations MUST revalidate all affected paths and keep service-role credentials and server-only modules out of client bundles.
- **FR-008**: Auth redirects MUST use a configured trusted origin, and internal cron authentication MUST use one documented secret with constant-time comparison.
- **FR-009**: Login, signup, reset, AI search suggestions, and customer search MUST enforce bounded inputs and appropriate abuse/privacy minimization.
- **FR-010**: The implementation MUST include regression coverage for public isolation, concurrent booking/status behavior, availability failure, reminder claims, and stable error mapping.

### Key Entities

- **Public booking lookup**: A tenant-bound read identified by business slug and validated public code.
- **Booking**: A time interval tied to a business, service, and optionally customer; its status and interval are protected by database invariants.
- **Reminder claim**: A short-lived worker lease/claim that prevents duplicate sends while allowing retry after failure.
- **Public catalog**: A minimal projection of active business and service fields safe for anonymous booking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No anonymous catalog query can return owner identifiers, plan/configuration, or unrelated tenant rows through the supported public contract.
- **SC-002**: For 100 concurrent overlapping booking attempts on one slot, the database accepts no more than one active booking.
- **SC-003**: For 100 concurrent status updates from the same observed state, exactly one compare-and-swap update wins per row.
- **SC-004**: A reminder booking is sent at most once per scheduled invocation window, and a mark-sent failure produces a non-2xx worker result.
- **SC-005**: Unit/type/lint checks pass, and regression tests cover every P1 acceptance scenario.

## Assumptions

- Existing public routes and RPC names remain compatible unless a new security-defensive RPC is introduced alongside them.
- The linked Supabase project is not mutated automatically in this task; migrations are prepared and validated locally, then can be pushed deliberately.
- Existing auth, Turnstile, timezone, and booking-history snapshot behavior remain unchanged.
- The repository's existing Supabase client and Zod utilities are reused before adding abstractions or dependencies.
- Where a durable reminder lease requires schema support, a forward-only migration is preferred over weakening the worker's correctness guarantees.

# Feature Specification: Security Response Hardening

**Feature Branch**: `main`
**Created**: 2026-09-22
**Status**: Implemented and deployed to the linked Supabase project
**Input**: Security review focused on identifying and eliminating API responses and public capabilities that expose more information or authority than intended.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cancel a booking only with a private capability (Priority: P1)

As a customer, I can cancel my booking from the private confirmation link, while a person who only knows the public booking code cannot cancel it.

**Why this priority**: The current public identifier can be transformed into cancellation authority. This permits an unauthorized state-changing action and is the highest-risk finding.

**Independent Test**: Create a booking, verify that cancellation fails with a missing or incorrect private token, succeeds with the issued private token, and cannot be authorized from the public code alone.

**Acceptance Scenarios**:

1. **Given** a confirmed booking and its private cancellation token, **When** the customer cancels it, **Then** the booking is cancelled and the token is not returned by any public lookup.
2. **Given** a valid public booking code but no private cancellation token, **When** cancellation is attempted, **Then** the request is rejected without revealing whether the token or booking was the failing input.
3. **Given** an incorrect cancellation token, **When** cancellation is attempted, **Then** the booking remains unchanged and the response is generic.
4. **Given** a newly created booking, **When** its identifiers are generated, **Then** the public code is generated from a cryptographically secure source and the cancellation capability has at least 128 bits of entropy.

---

### User Story 2 - Receive minimal and safe API responses (Priority: P1)

As a user, I receive actionable but generic failure messages, while provider, database, stack, credential, and implementation details remain server-side.

**Why this priority**: Raw operational errors and permissive data endpoints give attackers information that improves reconnaissance and exploitation.

**Independent Test**: Force billing-provider and persistence failures, call the authentication callback without valid credentials, and query protected base tables anonymously; verify that no internal details are returned and no protected data endpoint is anonymously available.

**Acceptance Scenarios**:

1. **Given** a billing provider or database failure, **When** an upgrade, retry, or cancellation action responds, **Then** the response contains a stable generic message and not the original error text.
2. **Given** an authentication callback without a valid authorization code or verification token, **When** it is called, **Then** the user is redirected to a safe login error state rather than an authenticated destination.
3. **Given** an anonymous API client, **When** it directly queries a protected base table, **Then** access is denied rather than returning an empty successful response.
4. **Given** an anonymous customer using an approved public workflow, **When** they view services or create a booking, **Then** that workflow continues to work through its deliberately exposed interface.

---

### User Story 3 - Resist browser and automated abuse (Priority: P2)

As a visitor, I can use the booking flows normally while the application rejects misconfigured or replayed anti-bot checks and instructs browsers to apply defensive policies.

**Why this priority**: These controls reduce automated abuse and limit the impact of cross-site scripting, framing, content sniffing, and unnecessary browser capabilities.

**Independent Test**: Inspect application headers and exercise anti-bot verification with missing configuration, wrong action, wrong hostname, and invalid tokens.

**Acceptance Scenarios**:

1. **Given** a production deployment without anti-bot credentials, **When** a protected public mutation is attempted, **Then** it fails closed.
2. **Given** an anti-bot result for the wrong action or hostname, **When** it is verified, **Then** the protected mutation is rejected.
3. **Given** a normal application response, **When** browser headers are inspected, **Then** framing, content sniffing, referrer leakage, excessive browser permissions, and unsafe content sources are restricted.
4. **Given** a normal application response, **When** implementation headers are inspected, **Then** the application does not advertise the framework signature under its control.

### Edge Cases

- A booking created before private cancellation tokens existed cannot be cancelled using only its public code; it must use an authenticated/support workflow.
- A cancellation token is URL-encoded, malformed, expired from browser history, or submitted more than once.
- The anti-bot provider is unavailable, returns an incomplete response, or omits action/hostname data.
- The configured application URL includes a port, path, or invalid hostname.
- A billing provider error contains customer data, request identifiers, HTML, or credential-like content.
- Database privileges are applied to existing and future objects without re-opening anonymous access.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST use separate values for a public booking identifier and cancellation authorization.
- **FR-002**: The system MUST generate cancellation tokens with at least 128 bits of cryptographic entropy and store only a one-way digest of each token.
- **FR-003**: Public booking lookup responses MUST NOT include the cancellation token, its digest, or data sufficient to derive it.
- **FR-004**: Cancellation MUST require a digest match for the supplied private token and MUST reject missing, malformed, or incorrect tokens with the same generic response.
- **FR-005**: New public booking codes MUST be generated from a cryptographically secure random source.
- **FR-006**: Billing actions MUST return stable generic user-facing failures and MUST NOT return raw provider, database, stack, or credential details.
- **FR-007**: Authentication callbacks MUST reject requests that do not contain a supported verification credential.
- **FR-008**: Anonymous clients MUST NOT have direct privileges on protected base tables.
- **FR-009**: Approved anonymous booking and catalog workflows MUST remain available through explicitly granted routines or server-mediated operations.
- **FR-010**: Anti-bot verification MUST fail closed in production when required configuration is absent or verification cannot be completed.
- **FR-011**: Anti-bot verification MUST validate the intended action and application hostname, and SHOULD bind the verification to the request address when available.
- **FR-012**: Protected public forms MUST label anti-bot challenges with the action expected by the server.
- **FR-013**: Application responses MUST include policies for content sources, framing, content sniffing, referrers, transport security, and unused browser permissions.
- **FR-014**: The application MUST disable framework-identifying response headers that are under application control.
- **FR-015**: Authentication policy configuration MUST require verified email, a minimum eight-character password with mixed character classes, and secure password changes.
- **FR-016**: Automated tests MUST cover rejected unauthorized cancellation, safe error mapping, invalid authentication callbacks, anti-bot validation, security headers, and anonymous database access.

### Key Entities *(include if feature involves data)*

- **Public booking identifier**: Human-readable reference used to locate a booking; it does not grant mutation authority.
- **Cancellation capability**: High-entropy secret delivered only to the customer. Only its digest is persisted.
- **Protected base table**: A database relation whose rows and even successful empty responses are unavailable directly to anonymous clients.
- **Safe API error**: Stable user-facing failure with no embedded upstream or persistence error text.

## Assumptions

- Existing bookings without a private cancellation capability require staff assistance rather than retaining the insecure derived-token fallback.
- Public catalog and booking creation remain supported through existing explicit routines and server-side actions.
- Platform-managed response headers that the application cannot suppress are outside application control; application-owned framework disclosure is removed.
- Development and automated test environments may use an explicit anti-bot bypass, but production never does.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In automated tests, 100% of cancellation attempts using only a public code, a missing token, or a wrong token leave the booking unchanged.
- **SC-002**: In failure-path tests, 0 raw provider or database error strings appear in user-facing billing responses.
- **SC-003**: Anonymous direct requests to every protected base table are denied, while all documented public booking/catalog workflows pass.
- **SC-004**: The authentication callback has no credential-free path to the authenticated destination.
- **SC-005**: All tested application responses include the required defensive headers and omit the application-controlled framework signature.
- **SC-006**: Production-mode anti-bot tests reject missing configuration, invalid verification, wrong action, and wrong hostname.
- **SC-007**: Unit, type, lint, and applicable integration/security test suites pass after the hardening changes.

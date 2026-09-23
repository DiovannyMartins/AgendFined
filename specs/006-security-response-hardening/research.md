# Research: Security Response Hardening

## Independent cancellation capability

**Decision**: Generate 32 random bytes in the server action, encode as base64url, hash with SHA-256, and pass only the digest into the service-role booking RPC. Return the raw token once to the browser and include it in the confirmation email link.

**Rationale**: The public code stays readable but no longer grants mutation authority. Digest-only persistence limits database-disclosure impact.

**Rejected**: HMAC(public code) remains derivable through the rendered confirmation flow; plaintext storage grants authority after row disclosure; post-insert digest updates create a partial-failure window.

## Database-authoritative cancellation

**Decision**: Require the digest in the service-role-only cancellation RPC and compare it in the same locked transaction that changes status. All failures map to one generic response.

**Rationale**: Authorization and mutation stay atomic and cannot be bypassed by a server caller.

## Secure public code generation

**Decision**: Keep the compatible eight-character reference, generate its bits with PostgreSQL cryptographic randomness, and retain the fail-closed lookup limiter.

**Rationale**: Once lookup-only, lengthening creates avoidable breakage; replacing the predictable PRNG fixes generation.

## Explicit database privileges

**Decision**: Revoke anonymous access to protected base tables and default privileges for future public tables. Preserve reviewed public RPC grants.

**Rationale**: RLS may hide rows, but successful empty responses advertise API shape.

## Turnstile binding

**Decision**: Require secret, site key, hostname, expected action, and token in production; submit client address when available; reject action/hostname mismatches. Non-production may run without keys.

**Rationale**: Provider success alone does not prove the token was issued for this site and operation.

## Static CSP

**Decision**: Configure global Next.js headers, disable `poweredByHeader`, and permit Next.js plus Cloudflare Turnstile while denying framing, objects, and unused capabilities.

**Rationale**: Next.js 16 documents this path. Nonce CSP forces dynamic rendering and disables static optimization/PPR.

## Stable errors and auth callback

**Decision**: Billing results never interpolate `Error.message`. An auth callback without a code or complete OTP tuple is an error; all redirects use the trusted origin.

**Rationale**: Upstream text can leak internals, and the prior null-initialized callback error treated no credentials as success.

# Implementation Plan: Security Response Hardening

**Branch**: `main` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-security-response-hardening/spec.md`

## Summary

Replace the cancellation token derived from the public booking code with an independent 256-bit random capability whose SHA-256 digest is stored atomically with the booking. Harden external boundaries: deny anonymous base-table privileges while preserving explicit public RPCs, map billing failures to stable messages, reject credential-free authentication callbacks, bind Turnstile verification to production configuration/action/hostname/request address, and add browser security headers.

## Technical Context

**Language/Version**: TypeScript 5, Node.js 22+, PostgreSQL 17 SQL/PLpgSQL

**Primary Dependencies**: Next.js 16.3 App Router, React 19, Supabase JS/Auth/PostgREST, Cloudflare Turnstile, Vitest 4, Playwright

**Storage**: Supabase PostgreSQL; one nullable digest column plus revised security-definer RPCs and grants

**Testing**: Vitest unit/component, Supabase integration on Node 22+, ESLint, TypeScript, Next.js build, targeted Playwright

**Target Platform**: Modern browsers, Vercel-hosted Next.js, hosted Supabase

**Project Type**: Full-stack web application

**Performance Goals**: No extra network round-trip during creation/cancellation; digest checks remain row scoped

**Constraints**: Preserve public catalog/booking workflows, never expose service-role credentials or token digests, keep existing bookings readable and fixed timezone behavior, add no dependency

**Scale/Scope**: Booking creation/cancellation, confirmation email/page, billing errors, auth callback, global headers, Auth configuration, and database privileges

## Constitution Check

*GATE: Passed before research and after design.*

- **Pass — Architecture**: Browser → server action/route → validation/domain rules → Supabase remains unchanged.
- **Pass — Reuse**: Node `crypto`, current actions, admin client, and Turnstile component are extended; no dependency is added.
- **Pass — Breaking changes**: The internal service-role-only booking RPC signature changes for a necessary security invariant. A forward migration drops the obsolete overload and updates repository callers/tests. Public routes remain stable; confirmation accepts one additional private query value.
- **Pass — Patterns**: Existing App Router, `lib/`, migration, and test patterns are retained.
- **Pass — Quality gates**: Unit, applicable integration, lint, typecheck, build, and response checks are included.

Post-design re-check: **Pass**. Existing rows retain lookup behavior and intentionally have no derivable cancellation authority.

## Project Structure

### Documentation

```text
specs/006-security-response-hardening/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/security-boundaries.md
└── tasks.md
```

### Source Code

```text
app/[slug]/{booking-widget.tsx,consultar/consultar-form.tsx,confirmacao/}
app/auth/callback/route.ts
components/turnstile-widget.tsx
lib/booking/{actions.ts,anti-bot.ts}
lib/bookings/cancel.ts
lib/billing/{start-upgrade.ts,retry-upgrade.ts,cancel-subscription.ts}
lib/email/booking-confirmation.ts
supabase/{config.toml,migrations/20260929000000_security_response_hardening.sql}
tests/{integration,e2e}/
```

**Structure Decision**: Modify the existing application in place. Token generation/hashing stays in the booking domain module, atomic enforcement stays in PostgreSQL RPCs, and response/browser controls remain at current boundaries.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Internal RPC signature change | Authorization must be stored atomically with creation and checked atomically during cancellation | Keeping the old overload permits creation without the invariant or preserves the vulnerable path |

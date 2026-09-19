# Implementation Plan: Backend Security and Consistency Hardening

**Branch**: `001-backend-security-concurrency-hardening` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

## Summary

Apply the approved backend-hardening specification without replacing the existing architecture. Public reads will move behind minimal security-definer catalog RPCs, confirmation and consultation will become slug-bound and fail-closed under rate-limit failure, and the latest booking RPC will be restored to the hardened `search_path`/active-business contract. Concurrent mutations will use database locks and compare-and-swap semantics. The reminder worker will use a bounded, atomically claimed queue contract. Next.js boundaries will return explicit errors, use trusted redirect origins, validate bounded inputs, and revalidate affected paths.

## Technical Context

**Language/Version**: TypeScript 5, SQL/PLpgSQL, Deno Edge runtime

**Primary Dependencies**: Next.js 16.3 App Router, React 19, `@supabase/supabase-js` 2.109, Zod 4, Vitest

**Storage**: Supabase PostgreSQL with RLS, security-definer RPCs, exclusion constraints, and server-side service-role calls

**Testing**: `npx vitest run --project unit`, `npm run typecheck`, `npm run lint`; integration tests via Node 22 when Supabase credentials are available

**Target Platform**: Vercel/Next.js Node runtime plus Supabase Edge Functions/Deno

**Project Type**: Existing single Next.js web application with Supabase backend

**Performance Goals**: Keep public lookups bounded; reminder batches are bounded; database locks cover only short mutation transactions

**Constraints**: Preserve public routes/RPC compatibility, existing timezone/Turnstile/history behavior, no ORM or new dependency, no linked-remote migration push during this task

## Constitution Check

- I. Existing architecture preserved: PASS. Changes stay in `app/`, `lib/`, `supabase/`, and tests.
- II. Reuse before create: PASS. Existing Zod, rate-limit, admin-client, and RPC patterns are reused.
- III. Compatibility: PASS. Existing public URLs and booking RPC argument lists remain compatible; new catalog/claim RPCs are additive.
- IV. Existing patterns: PASS. All mutation boundaries remain validated server-side and service-role code remains server-only.
- V. Quality gates: REQUIRED before completion. Unit, typecheck, lint, and SQL/static checks will be run.

## Research Summary

See [research.md](./research.md). The key decisions are based on repository evidence plus the installed Next.js 16 docs and Supabase/Postgres guidance: Server Actions are public POST endpoints and must re-check authorization; public base-table reads expose every selected column allowed by RLS; queue workers need atomic claim-and-update; and exclusion constraints remain the final overlap guard.

## Project Structure

```text
app/[slug]/confirmacao/page.tsx
app/[slug]/page.tsx
app/[slug]/consultar/page.tsx
app/[slug]/booking-widget.tsx
app/auth/callback/route.ts
app/api/internal/reconciliation/route.ts
lib/auth/actions.ts
lib/availability/actions.ts
lib/bookings/actions.ts
lib/services/actions.ts
lib/services/search.ts
lib/customers/search.ts
lib/supabase/admin.ts
supabase/functions/booking-reminders/index.ts
supabase/migrations/20260928000000_backend_security_concurrency_hardening.sql
tests/...
```

**Structure Decision**: Keep the existing single-project structure. Database contracts are authoritative for cross-request invariants; Next.js code adapts those contracts into existing `ActionResult`/UI states.

## Design Decisions

1. Remove anonymous/authenticated public SELECT policies on `businesses` and `services` after adding allowlisted catalog RPCs. This prevents PostgREST `select=*` from exposing future columns.
2. Keep the existing public booking lookup RPC for compatibility, but confirmation validates `publicCodeSchema`, applies the consultation limiter, and verifies `business_slug === slug` before rendering or deriving a cancellation capability.
3. Add an atomic reminder claim RPC with a short lease column. Candidate selection and claim happen inside PostgreSQL; the Edge Function validates the returned shape, sends a bounded batch, and reports mark failures.
4. Fix service deletion and booking creation with the same service-row lock and an atomic delete RPC, avoiding a check-then-delete race.
5. Use a status compare-and-swap update in the Server Action so stale status reads cannot overwrite a newer transition.
6. Treat availability read errors as errors, not empty availability; the UI handles the returned error state.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Add a reminder claim/lease column and RPC | At-most-once send attempt per active claim plus retry after worker failure | Client-only dedup cannot coordinate concurrent Edge invocations |

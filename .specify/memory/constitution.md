<!-- Sync Impact Report
Version change: 0.0.0 (template placeholders) → 1.0.0
Modified principles: [PRINCIPLE_1..5 placeholders] → I–V concrete principles below
Added sections: Technical Constraints, Development Workflow, Governance rules concretized
Removed sections: none (template slots filled)
Follow-up TODOs: none
-->

# AgendFined Constitution

## Core Principles

### I. Preserve Existing Architecture (NON-NEGOTIABLE)

Every change MUST preserve the current architecture of this existing project.
Libraries MUST NOT be replaced without demonstrated necessity (missing capability,
blocking bug, or security issue with no viable workaround). The established
organization of folders, layers, and data flow
(Browser → Next.js UI → Server Action / Route Handler → Zod + domain rules →
Supabase PostgreSQL / Auth, with RLS + constraints + transactions) MUST be
followed. Deviations require explicit justification and approval.

### II. Reuse Before Create

Existing components, services, and utilities MUST be reused whenever they fit.
Duplication of functionality already present in the project is forbidden.
Before adding any dependency, the author MUST verify that the functionality does
not already exist in the project or in an already-installed library, and MUST
document the check result in the PR or spec.

### III. No Unnecessary Breaking Changes

Breaking changes to existing APIs, contracts, database schemas, RLS policies,
RPCs, or public routes (including `/[slug]` and confirmation via `public_code`)
MUST NOT be introduced without necessity. Compatibility with existing APIs and
consumers MUST be maintained. When a breaking change is unavoidable, it MUST be
isolated, versioned or migrated, and accompanied by a migration plan.

### IV. Consistency With Existing Patterns

All new code MUST follow the folder organization, naming, and patterns already
used in the repository: App Router routes under `app/`, shared UI under
`components/`, shared logic under `lib/`, migrations under `supabase/`, and
tests under `tests/`. Server-side validation with Zod plus domain rules is
mandatory for relevant mutations; the UI is never the final source of truth for
availability. Canonical domain vocabulary in `CONTEXT.md` MUST be respected.
The `service_role` key MUST remain server-only.

### V. Quality Gates (NON-NEGOTIABLE)

Every change MUST pass the repository's existing standards for tests, lint,
typecheck, and formatting: `npm run test` (Vitest unit), integration suite via
Node 22+, `npm run test:e2e` (Playwright) where applicable, `npm run lint`
(ESLint), and `npm run typecheck` (`tsc --noEmit`). New behavior MUST include
or update tests following the existing patterns; availability and booking
correctness MUST remain covered, including concurrency protection (exclusion
constraint) and the fixed `America/Sao_Paulo` timezone rule (store UTC, display
Brasília time).

## Technical Constraints

Stack is fixed: Next.js 16 (App Router) + React 19 + TypeScript 5, Tailwind
CSS 4, shadcn/ui + Lucide, React Hook Form + Zod, Supabase Auth + PostgreSQL
(RLS, constraints, RPCs such as `create_booking`), Vitest + Playwright, Vercel
hosting. Runtime requires Node >= 22. Local Supabase workflow: migrations under
`supabase/` pushed with `npx supabase db push --linked`. Anti-bot Cloudflare
Turnstile gate on the public booking flow and snapshot-based booking history
(name, price, duration) MUST NOT be regressed.

## Development Workflow

Spec-driven workflow: product source of truth is `documento-projeto.md`;
domain language source of truth is `CONTEXT.md`; decisions recorded in
`docs/adr/`. Issues live as GitHub issues via `gh` CLI; triage uses the
five-role label vocabulary (needs-triage, needs-info, ready-for-agent,
ready-for-human, wontfix). Code review MUST verify constitution compliance,
dependency necessity, API compatibility, and quality-gate results.

## Governance

This constitution supersedes all other development practices in this project.
Amendments require documentation of the change, version bump per semantic
versioning (MAJOR: incompatible governance/principle removals or
redefinitions; MINOR: new principle or materially expanded guidance; PATCH:
clarifications and wording), and an updated Sync Impact Report reviewed before
commit. All PRs and reviews MUST verify compliance; complexity and new
dependencies MUST be justified. Runtime guidance: `AGENTS.md`, `CONTEXT.md`,
and `docs/agents/`.

**Version**: 1.0.0 | **Ratified**: 2026-09-14 | **Last Amended**: 2026-09-14

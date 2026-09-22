---
description: "Task list for displaying the PROFISSIONAL plan in dashboard settings"
---

# Tasks: Oferta do plano PROFISSIONAL nas configurações

**Input**: Design documents from `/specs/004-dashboard-pro-plan-display/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Required by the project constitution. Unit tests use Vitest and Testing Library; tests are written before the implementation task for the new UI behavior.

## Phase 1: Setup

**Purpose**: Confirm the existing plan and billing seams are the implementation boundaries.

- [X] T001 Review `app/dashboard/configuracoes/plan-section.tsx`, `lib/plan/catalog.ts`, and `lib/billing/actions.ts` against the feature spec before editing

## Phase 2: Foundational

**Purpose**: No new foundational infrastructure is required; the existing plan catalog and checkout action are reused.

## Phase 3: User Story 1 - Conhecer e assinar o plano PROFISSIONAL (Priority: P1) 🎯 MVP

**Goal**: A Grátis user sees the current plan and a complete PROFISSIONAL offer with R$ 1/month and an explicit subscription CTA.

**Independent Test**: Render the settings plan section for a Grátis business with and without a pending checkout and assert the current badge, Pro plan name, R$ 1/month price, Pro benefits, and state-appropriate CTA.

### Tests for User Story 1

- [X] T002 [P] [US1] Add a unit test for the Grátis settings state in `app/dashboard/configuracoes/plan-section.test.tsx`, covering the current Grátis card, separate PROFISSIONAL offer, `R$ 1/mês`, Pro benefits, and `Assinar PROFISSIONAL` CTA

### Implementation for User Story 1

- [X] T003 [US1] Update `app/dashboard/configuracoes/plan-section.tsx` to render the current Grátis plan and a separate PROFISSIONAL offer for every Grátis business, reusing `PLAN_INFO` and the existing checkout actions
- [X] T004 [US1] Keep the settings plan layout responsive in `app/dashboard/configuracoes/plan-section.tsx`, stacking plan cards on narrow viewports without changing subscription status, grace, retry, or cancel controls
- [X] T010 [US1] Correct `app/dashboard/configuracoes/plan-section.tsx` and `app/dashboard/configuracoes/plan-section.test.tsx` so a Grátis business keeps the PROFISSIONAL card visible during a pending checkout and uses `Concluir pagamento` instead of starting a duplicate subscription

**Checkpoint**: The Grátis settings state shows the current plan and the complete R$ 1 Pro offer, and its unit test passes.

## Phase 4: User Story 2 - Entender o plano já contratado (Priority: P2)

**Goal**: Existing Pro subscribers retain their active status and subscription controls without a duplicate upgrade offer.

**Independent Test**: Render the settings plan section for an authorized Pro business and verify active status and cancellation controls remain present while duplicate upgrade content is absent.

- [X] T005 [US2] Extend `app/dashboard/configuracoes/plan-section.test.tsx` with authorized Pro and pending/grace state assertions so existing subscription controls and messages remain preserved
- [X] T006 [US2] Adjust `app/dashboard/configuracoes/plan-section.tsx` only as needed to keep Pro active, pending, grace, retry, re-subscribe, and cancel states mutually exclusive and unchanged in behavior

**Checkpoint**: Pro and transitional subscription states remain independently functional.

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validate the implementation against the repository quality gates and quickstart.

- [X] T007 [P] Run the unit suite with `npx vitest run --project unit` and resolve failures related to `app/dashboard/configuracoes/plan-section.tsx` or its tests
- [X] T008 [P] Run `npm run lint` and `npm run typecheck`; fix only issues caused by this feature
- [X] T009 Run the manual validation steps in `specs/004-dashboard-pro-plan-display/quickstart.md`, including a narrow viewport check

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 is the prerequisite for implementation.
- **Foundational (Phase 2)**: No work required; existing infrastructure is sufficient.
- **User Story 1 (Phase 3)**: T002 should be written and fail before T003/T004; T003 precedes T004.
- **User Story 2 (Phase 4)**: Depends on the shared `plan-section.tsx` changes from T003/T004; T005 precedes any T006 adjustment.
- **Polish (Phase 5)**: Depends on T003–T006; T007 and T008 can run independently, T009 follows their successful completion.

### Parallel Opportunities

- T002 can be prepared independently of the implementation after T001.
- T007 and T008 touch different validation concerns and can run in parallel after implementation.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001.
2. Write T002 and confirm it fails for the current single-plan implementation.
3. Complete T003 and T004.
4. Run the US1 test and validate that a Grátis user sees the R$ 1 Pro offer and CTA.

### Incremental Delivery

1. Preserve the existing billing state logic while adding the Grátis comparison view.
2. Verify Pro and transitional states with T005/T006.
3. Run all quality gates and the quickstart validation.

## Phase 6: Convergence

**Purpose**: Remover do card Grátis a mensagem de checkout pendente, que não representa o plano atual enquanto o pagamento ainda não foi autorizado.

- [X] T011 [US1] Ocultar o status e a explicação de checkout pendente no card Grátis, mantendo a oferta PROFISSIONAL e sua ação de conclusão de pagamento, e atualizar `app/dashboard/configuracoes/plan-section.test.tsx` para cobrir a ausência dessa mensagem (user request, partial)

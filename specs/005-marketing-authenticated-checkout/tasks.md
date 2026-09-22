---
description: "Task list for authenticated marketing checkout"
---

# Tasks: Checkout direto para usuários autenticados

**Input**: Design documents from `/specs/005-marketing-authenticated-checkout/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Incluídos porque os cenários de autenticação, nova aba e falha são requisitos explícitos.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar que a implementação usa a estrutura e o fluxo de billing existentes.

- [X] T001 Confirmar o ponto de entrada da página de marketing, o server action `startUpgrade` e o padrão de nova aba em `app/(marketing)/page.tsx`, `lib/billing/actions.ts` e `app/dashboard/configuracoes/upgrade-button.tsx`.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Não há infraestrutura nova; o billing existente é a fundação da feature.

- [X] T002 Confirmar que nenhum schema, endpoint ou dependência nova é necessário para `005-marketing-authenticated-checkout`.

## Phase 3: User Story 1 - Assinar diretamente estando logado (Priority: P1) 🎯 MVP

**Goal**: Usuários autenticados iniciam o checkout PROFISSIONAL diretamente da página de marketing e o abrem em uma nova aba.

**Independent Test**: Renderizar o CTA autenticado, clicar, verificar a abertura síncrona de uma aba e a navegação dessa aba para o `initPoint` de `startUpgrade`.

### Tests for User Story 1

- [X] T003 [P] [US1] Adicionar testes unitários para CTA autenticado, estado pendente e abertura do `initPoint` em nova aba em `app/(marketing)/marketing-plan-cta.test.tsx`.

### Implementation for User Story 1

- [X] T004 [US1] Criar o Client Component do CTA autenticado em `app/(marketing)/marketing-plan-cta.tsx`, chamando `startUpgrade`, desabilitando durante a transição e navegando a aba temporária para `initPoint`.
- [X] T005 [US1] Atualizar `app/(marketing)/page.tsx` para obter `auth.getUser()` no servidor e passar o estado de autenticação para os planos.
- [X] T006 [US1] Atualizar `app/(marketing)/plans.tsx` para aceitar o estado autenticado e renderizar o CTA de checkout para o plano PROFISSIONAL sem alterar o preço de R$ 1/mês.

**Checkpoint**: Usuários autenticados elegíveis devem chegar ao Mercado Pago sem passar pelo dashboard.

## Phase 4: User Story 2 - Manter o fluxo de visitantes (Priority: P2)

**Goal**: Visitantes continuam indo para o cadastro antes de assinar.

**Independent Test**: Renderizar o CTA sem autenticação e verificar o link `/cadastro`.

### Tests for User Story 2

- [X] T007 [P] [US2] Adicionar teste unitário para CTA anônimo apontando para `/cadastro` em `app/(marketing)/marketing-plan-cta.test.tsx`.

### Implementation for User Story 2

- [X] T008 [US2] Preservar o link de cadastro no caminho anônimo do CTA em `app/(marketing)/marketing-plan-cta.tsx` e validar o cenário da landing page em `tests/e2e/landing.spec.ts`.

**Checkpoint**: Visitantes não autenticados continuam no onboarding existente.

## Phase 5: User Story 3 - Exibir falhas sem navegação indevida (Priority: P3)

**Goal**: Falhas do billing e bloqueios de pop-up aparecem no card, sem redirecionamento para o dashboard.

**Independent Test**: Simular falha do server action ou bloqueio de `window.open` e verificar a mensagem inline e o fechamento da aba temporária.

### Tests for User Story 3

- [X] T009 [P] [US3] Adicionar testes unitários para pop-up bloqueado, falha de `startUpgrade` e fechamento da aba em `app/(marketing)/marketing-plan-cta.test.tsx`.

### Implementation for User Story 3

- [X] T010 [US3] Implementar feedback inline e limpeza da aba temporária para respostas de erro em `app/(marketing)/marketing-plan-cta.tsx`.
- [X] T011 [US3] Garantir que o CTA autenticado não navegue para `/dashboard` em falhas e que as mensagens de domínio de `startUpgrade` sejam preservadas em `app/(marketing)/marketing-plan-cta.tsx`.

**Checkpoint**: Erros são compreensíveis e o usuário permanece na página pública.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validar a feature inteira e atualizar os artefatos Spec Kit.

- [X] T012 [P] [US1] Executar a validação automatizada descrita em `specs/005-marketing-authenticated-checkout/quickstart.md`.
- [X] T013 [P] [US1] Atualizar `specs/005-marketing-authenticated-checkout/spec.md`, `plan.md`, `quickstart.md` e este arquivo com o status final, se algum comportamento implementado exigir ajuste documental.

## Dependencies & Execution Order

### Phase Dependencies

- Setup e Foundational não alteram código e devem ser confirmados antes das histórias.
- US1 é o MVP e deve ser concluída antes da validação de integração das demais histórias.
- US2 depende da integração do CTA em US1, mas valida um caminho independente.
- US3 depende do componente criado em US1 e cobre seus caminhos de erro.
- Polish depende de todas as histórias.

### Parallel Opportunities

- T003 pode ser escrito antes de T004; T007 e T009 podem ser adicionados ao mesmo arquivo de teste em conjunto lógico, embora a execução seja sequencial por compartilharem o arquivo.
- T005 e T006 dependem da definição do CTA, mas podem ser desenvolvidos em arquivos diferentes após T004.
- T012 e T013 são tarefas de validação/documentação após a implementação.

## Implementation Strategy

1. Implementar US1 com testes primeiro: sessão server-side, CTA autenticado e nova aba.
2. Validar US1 com teste unitário e então manter explicitamente o link anônimo de US2.
3. Cobrir erros de US3 sem alterar `lib/billing/actions.ts`.
4. Rodar testes, lint e typecheck; marcar os artefatos como concluídos somente após a validação.

## Phase 7: Convergence

**Purpose**: Fechar a lacuna descoberta após o primeiro fluxo: uma assinatura pendente precisa permitir um checkout novo pelo CTA da página pública.

- [X] T014 [US1] Adicionar teste de regressão para a resposta `UPGRADE_PENDING`, verificando que o CTA chama o retry e abre o novo `initPoint` em `app/(marketing)/marketing-plan-cta.test.tsx` (US1/AC4, partial).
- [X] T015 [US1] Atualizar `app/(marketing)/marketing-plan-cta.tsx` para chamar `retryUpgrade` quando `startUpgrade` informar checkout pendente, mantendo a abertura em nova aba e os guardrails server-side (FR-002, FR-008, partial).
- [X] T016 [US1] Atualizar `research.md`, `plan.md` e `quickstart.md` para registrar o fallback seguro entre checkout inicial e retry (FR-007, partial).
- [X] T017 [P] [US1] Executar testes unitários, lint, typecheck e build descritos em `specs/005-marketing-authenticated-checkout/quickstart.md` e confirmar que o preço de R$ 1/mês não foi alterado (SC-004, SC-005).

## Phase 8: Convergence

**Purpose**: Ajustar a navegação do checkout para substituir a aba atual em todos os CTAs de assinatura.

- [X] T018 [US1] Atualizar os testes do CTA de marketing e dos botões do dashboard para verificar navegação na mesma aba e ausência de `window.open` em `app/(marketing)/marketing-plan-cta.test.tsx` e `app/dashboard/configuracoes/checkout-buttons.test.tsx` (US1/AC1, US1/AC3, partial).
- [X] T019 [US1] Alterar `app/(marketing)/marketing-plan-cta.tsx`, `app/dashboard/configuracoes/upgrade-button.tsx`, `app/dashboard/configuracoes/retry-upgrade-button.tsx` e `lib/billing/checkout-navigation.ts` para navegar na aba atual sem abrir nova aba, preservando os erros inline (FR-003, FR-006, partial).
- [X] T020 [US1] Atualizar `spec.md`, `plan.md`, `research.md` e `quickstart.md` para documentar a navegação na mesma aba (FR-003, partial).
- [X] T021 [P] [US1] Executar testes unitários, lint, typecheck e build e confirmar que nenhum CTA de checkout usa `window.open` (SC-001, partial).

# Implementation Plan: Checkout direto para usuários autenticados

**Branch**: `005-marketing-authenticated-checkout` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-marketing-authenticated-checkout/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

Usuários autenticados devem iniciar o checkout PROFISSIONAL diretamente pela página de marketing. A página verificará a sessão no servidor; visitantes continuarão usando o link de cadastro, enquanto usuários logados receberão um CTA client-side que chama o `startUpgrade` existente, usa `retryUpgrade` quando houver checkout pendente e navega para o `initPoint` do Mercado Pago na mesma aba.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript, Next.js App Router, React

**Primary Dependencies**: Next.js server components/actions, Supabase Auth, Mercado Pago billing existente, Vitest, Testing Library

**Storage**: PostgreSQL/Supabase e registros de billing existentes; nenhum schema novo

**Testing**: Vitest unitário, ESLint e TypeScript typecheck

**Target Platform**: Navegadores modernos e runtime Next.js hospedado

**Project Type**: Aplicação web full-stack

**Performance Goals**: O clique deve criar a aba imediatamente e concluir a navegação assim que o server action retornar; sem chamadas extras de autenticação no cliente

**Constraints**: Reutilizar `startUpgrade`/`retryUpgrade`, manter R$ 1/mês, não confiar em estado de autenticação enviado pelo cliente, preservar o fluxo anônimo para `/cadastro` e navegar na mesma aba

**Scale/Scope**: Um CTA da página de marketing, uma verificação server-side e cobertura unitária dos fluxos autenticado/anônimo/erro

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Os princípios de arquitetura, segurança, reutilização e qualidade são atendidos:

- **Pass**: reutilizar os server actions de billing existentes, sem duplicar preço ou lógica de Mercado Pago.
- **Pass**: manter a autorização no servidor e limitar o client component à interação e navegação.
- **Pass**: preservar o comportamento público existente para visitantes.
- **Pass**: adicionar testes unitários para os caminhos de CTA e executar lint/typecheck.
- **Pass**: nenhuma migração ou dependência nova é necessária.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file ($speckit-plan command output)
├── research.md          # Phase 0 output ($speckit-plan command)
├── data-model.md        # Phase 1 output ($speckit-plan command)
├── quickstart.md        # Phase 1 output ($speckit-plan command)
├── contracts/           # Phase 1 output ($speckit-plan command)
└── tasks.md             # Phase 2 output ($speckit-tasks command - NOT created by $speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
app/
├── (marketing)/
│   ├── page.tsx                    # lê sessão no servidor
│   ├── plans.tsx                   # escolhe CTA anônimo/autenticado
│   └── marketing-plan-cta.tsx      # inicia ou repete checkout na mesma aba
└── dashboard/configuracoes/
    └── upgrade-button.tsx          # padrão existente de nova aba

lib/billing/actions.ts              # server action startUpgrade reutilizado
lib/billing/checkout-navigation.ts  # navegação do checkout na mesma aba
tests/                              # testes unitários existentes
```

**Structure Decision**: Aplicação Next.js existente, mantendo a leitura de sessão no Server Component da página de marketing e isolando a chamada de server action e navegação na mesma aba em Client Components pequenos. Nenhum novo serviço, endpoint ou modelo de dados será criado.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Nenhuma | N/A | A feature cabe na estrutura atual e reutiliza o billing existente. |

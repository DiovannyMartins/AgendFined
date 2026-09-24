# Implementation Plan: Oferta do plano PROFISSIONAL nas configurações

**Branch**: `004-dashboard-pro-plan-display` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-dashboard-pro-plan-display/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

Exibir duas ofertas na seção de configurações quando o negócio estiver no Grátis: o plano atual Grátis e o plano PROFISSIONAL com R$ 19/mês, benefícios e uma ação de assinatura. A implementação reutilizará o catálogo de planos, o componente de checkout e os controles de estado já presentes, separando a apresentação da oferta do estado atual sem alterar regras de billing.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5, React 19, Node.js >= 22

**Primary Dependencies**: Next.js 16 App Router, Tailwind CSS 4, shadcn/ui, Lucide, Vitest, Testing Library

**Storage**: Supabase PostgreSQL; nenhuma alteração de schema

**Testing**: Vitest unitário com jsdom; lint e typecheck do repositório

**Target Platform**: Aplicação web responsiva em navegadores modernos

**Project Type**: Aplicação web full-stack com dashboard autenticado

**Performance Goals**: A seção deve renderizar junto com a página de configurações sem nova consulta de dados além das já necessárias para o estado de assinatura.

**Constraints**: Manter o preço de teste R$ 19/mês; preservar checkout, status, carência e cancelamento; não introduzir dependências ou alterações de banco.

**Scale/Scope**: Uma seção do dashboard e seus testes; catálogo compartilhado já existente; sem mudança na landing page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Passa. A mudança preserva a arquitetura App Router → componente de dashboard → server action de billing, reutiliza `PLAN_INFO` e `UpgradeButton`, não muda contratos ou banco, e adiciona cobertura para a nova apresentação e estados existentes.

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
└── dashboard/configuracoes/
    ├── plan-section.tsx
    ├── upgrade-button.tsx
    └── plan-section.test.tsx
lib/
├── plan/catalog.ts
└── billing/
    ├── get-subscription.ts
    └── actions.ts
```

**Structure Decision**: A seção continua sendo um Server Component em `app/dashboard/configuracoes`, buscando o estado de assinatura no servidor e compondo o `UpgradeButton` Client Component para o checkout. O catálogo canônico em `lib/plan/catalog.ts` continua sendo a fonte do nome, preço e recursos. O teste do componente fica junto à rota, seguindo o padrão de inclusão do Vitest.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Nenhuma | N/A | A mudança cabe na estrutura existente e não cria nova camada. |

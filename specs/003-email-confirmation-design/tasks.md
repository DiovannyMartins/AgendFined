# Tasks: E-mail profissional de confirmação

**Input**: Design documents from `/specs/003-email-confirmation-design/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/booking-confirmation-email.md

## Phase 1: Foundational

**Purpose**: Fixar o contrato de renderização antes da alteração do envio.

- [x] T001 [P] [US1] Adicionar testes unitários do payload de confirmação em `lib/email/booking-confirmation.test.ts`, cobrindo HTML, texto, paleta, assunto e destinatário.
- [x] T002 [P] [US1] Adicionar caso de escaping para valores dinâmicos contendo caracteres HTML em `lib/email/booking-confirmation.test.ts`.

## Phase 2: User Story 1 - Receber uma confirmação profissional (Priority: P1)

**Goal**: Entregar um e-mail HTML organizado, legível e alinhado à identidade visual do site.

**Independent Test**: Os testes confirmam que o payload tem HTML completo com os dados da reserva, estilos da paleta e fallback texto.

- [x] T003 [US1] Implementar helper seguro de escaping e template HTML com tabela, cabeçalho, status, detalhes e rodapé em `lib/email/booking-confirmation.ts`.
- [x] T004 [US1] Enviar o novo campo `html` junto com `text` no POST existente ao Resend em `lib/email/booking-confirmation.ts`, preservando o contrato atual.

## Phase 3: User Story 2 - Preservar o envio atual (Priority: P1)

**Goal**: Garantir que o fluxo de reserva e os estados de erro existentes permaneçam compatíveis.

**Independent Test**: Testes do módulo passam com ausência de configuração, resposta HTTP de erro e exceção de rede.

- [x] T005 [US2] Preservar e testar os retornos `not_configured` e `provider_error` em `lib/email/booking-confirmation.test.ts`.
- [x] T006 [US2] Executar `npm run test`, `npm run typecheck` e `npm run lint`, registrando os resultados na documentação da feature.

## Dependencies & Execution Order

- T001 e T002 podem ser escritos em paralelo.
- T003 e T004 dependem dos contratos cobertos por T001/T002.
- T005 verifica a compatibilidade do envio depois de T004.
- T006 depende de todas as alterações anteriores.

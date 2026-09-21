# Tasks: E-mail de confirmação e janela de reserva por plano

## Phase 1: Fundação

- [x] T001 Definir e centralizar os tetos Grátis (90) e PRO (365) em `lib/plan/plan.ts`.
- [x] T002 Ampliar a validação genérica da janela de negócio para 365 dias em `lib/validation/schemas.ts`.

## Phase 2: User Story 1 - Confirmação por e-mail (P1)

- [x] T003 Tornar o e-mail válido obrigatório na reserva pública em `lib/validation/schemas.ts` e `app/[slug]/booking-widget.tsx`.
- [x] T004 Criar envio de confirmação server-side reutilizando o Resend em `lib/email/booking-confirmation.ts`.
- [x] T005 Enviar a confirmação depois de `create_booking` em `lib/booking/actions.ts`, sem desfazer a reserva em caso de falha.

## Phase 3: User Story 2 - Limites por plano (P1)

- [x] T006 Aplicar janela efetiva na consulta de horários e server action em `lib/availability/actions.ts` e `lib/booking/actions.ts`.
- [x] T007 Expor teto no painel e validar configuração pelo plano atual em `app/dashboard/configuracoes/business-form.tsx` e `lib/business/actions.ts`.
- [x] T008 Ampliar coluna e aplicar limites na RPC em `supabase/migrations/20260928000003_booking_confirmation_plan_window.sql`.
- [x] T009 Atualizar catálogo comercial e contexto em `lib/plan/catalog.ts`, `.env.example` e `CONTEXT.md`.

## Phase 4: Convergência

- [x] T010 Revisar que a RPC continua service-role-only, que dados antigos continuam compatíveis e que as três camadas usam os mesmos limites.

## Verificação

- `npm run typecheck`: passou.
- `npm run lint`: passou com 9 avisos já existentes em arquivos de agenda, disponibilidade e formatação.
- Testes automatizados não foram executados.
- A migration está pronta no repositório e precisa ser aplicada no Supabase no fluxo de deploy.

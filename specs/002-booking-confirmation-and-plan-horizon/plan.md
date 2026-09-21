# Implementation Plan: E-mail de confirmação e janela por plano

**Branch**: `002-booking-confirmation-and-plan-horizon` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

## Summary

Exigir e-mail válido na reserva pública e enviar confirmação via Resend após a gravação da reserva. Limitar a janela efetiva ao menor valor entre a configuração do negócio e o teto do plano (90 dias Grátis, 365 PRO), aplicando a regra na UI, server actions e RPC `create_booking`.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16, Node.js 22+; PostgreSQL/Supabase.

**Primary Dependencies**: Dependências instaladas; envio direto ao endpoint HTTP do Resend já usado pelos lembretes.

**Storage**: `businesses.booking_window_days`, `businesses.plan` e snapshots atuais em `bookings`.

**Testing**: Sem novas dependências; passos manuais em [quickstart.md](quickstart.md). A execução de testes não foi solicitada.

**Target Platform**: Next.js server actions + Supabase Postgres.

**Project Type**: Aplicação web.

**Constraints**: `service_role` só no servidor; preserve a janela por data no fuso `America/Sao_Paulo`; respeite a RPC como autoridade final para reservas.

**Scale/Scope**: Duas rotinas públicas, uma tela de configuração, plano/catálogo e uma migration.

## Constitution Check

- **Preserve architecture**: passa; reutiliza as server actions, RPC, Supabase e o Resend existente.
- **Reuse before create**: passa; não adiciona pacote ou provedor.
- **Compatibility**: registros antigos sem e-mail continuam válidos; novos bookings exigem e-mail. O limite da coluna passa de 180 para 365 dias.
- **Consistency/security**: passa; segredo do Resend fica no servidor, e o limite é aplicado no banco além da interface.
- **Quality gates**: implementação seguirá as convenções do repositório. Execução de testes não solicitada.

## Project Structure

```text
lib/plan/plan.ts
lib/plan/catalog.ts
lib/booking/actions.ts
lib/availability/actions.ts
lib/business/actions.ts
lib/validation/schemas.ts
lib/email/booking-confirmation.ts
app/[slug]/booking-widget.tsx
app/dashboard/configuracoes/business-form.tsx
supabase/migrations/20260928000003_booking_confirmation_plan_window.sql
specs/002-booking-confirmation-and-plan-horizon/
```

**Structure Decision**: Mantém as camadas e os caminhos atuais do projeto.

## Complexity Tracking

Nenhuma exceção à constituição do projeto.

# 0002 — Snapshot do serviço na reserva

**Status:** aceito

A reserva copia nome, preço e duração do serviço no momento em que é criada (`service_name_snapshot` e afins). Telas e e-mails leem o snapshot, nunca fazem join com `services`. Assim, editar ou excluir um serviço não altera o histórico.

Por isso o serviço pode ser excluído mesmo com histórico: `bookings.service_id` é anulável, com `ON DELETE SET NULL`, e a reserva perde só o vínculo (`20260921000000_allow_service_delete_preserve_bookings.sql`). A antiga FK composta garantia que o serviço pertencesse ao mesmo negócio da reserva; essa garantia passou para o trigger `enforce_booking_service_business`. A exclusão continua bloqueada enquanto houver reserva agendada para o serviço.

## Alternativas consideradas

Manter a pré-verificação na aplicação e confiar só no `ON DELETE SET NULL` foi rejeitado: uma reserva podia ser inserida depois da verificação e perder o vínculo. Criar e excluir travam a linha do serviço, o que serializa a invariante (spec 001).

## Fontes

- `CONTEXT.md` — "Serviço" e "Snapshot (da reserva)"
- `supabase/migrations/20260921000000_allow_service_delete_preserve_bookings.sql`
- `specs/001-backend-security-concurrency-hardening/research.md` — "Service deletion race"

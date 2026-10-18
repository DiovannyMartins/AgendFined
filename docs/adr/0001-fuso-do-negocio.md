# 0001 — Datas em UTC, interpretadas no fuso do negócio

**Status:** aceito

Instantes (reservas, bloqueios, lista de espera) são gravados em UTC. Cada negócio tem um fuso IANA em `businesses.timezone` (padrão `America/Sao_Paulo`), e disponibilidade, faixas, bloqueios digitados no dashboard e slots são interpretados e exibidos nesse fuso. A disponibilidade é uma regra em hora local do negócio, não em UTC.

O fuso não pode mudar enquanto houver reservas agendadas: as reservas mantêm seus instantes UTC, mas a disponibilidade mudaria de significado. As Server Actions recusam a troca, e o trigger `prevent_timezone_change_with_scheduled_bookings` garante o mesmo no banco, porque o dono também consegue atualizar `businesses` direto pelo PostgREST.

## Histórico

O produto chegou a operar com fuso único America/Sao_Paulo (`20260922000000_remove_timezone.sql`). O fuso por negócio voltou em `20261013000000_restore_business_timezone.sql`, com a trava em `20261015010000_business_timezone_guard.sql`. A conversão de bloqueios digitados no dashboard foi corrigida na issue #77.

## Fontes

- `CONTEXT.md` — "Fuso do negócio"
- `supabase/migrations/20261013000000_restore_business_timezone.sql`
- `supabase/migrations/20261015010000_business_timezone_guard.sql`

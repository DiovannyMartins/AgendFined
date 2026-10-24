# 0001 — Datas em UTC, interpretadas no fuso do negócio

**Status:** aceito

Instantes (reservas, bloqueios, lista de espera) são gravados em UTC. Cada negócio tem um fuso IANA em `businesses.timezone` (padrão `America/Sao_Paulo`), e disponibilidade, faixas, bloqueios digitados no dashboard e slots são interpretados e exibidos nesse fuso. A disponibilidade é uma regra em hora local do negócio, não em UTC.

O fuso não pode mudar enquanto houver reservas agendadas: as reservas mantêm seus instantes UTC, mas a disponibilidade mudaria de significado. As Server Actions recusam a troca, e o trigger `prevent_timezone_change_with_scheduled_bookings` garante o mesmo no banco, porque o dono também consegue atualizar `businesses` direto pelo PostgREST.

O fuso precisa ser brasileiro. O telefone do negócio e do cliente é sempre validado como brasileiro, então um negócio em Lisboa ou Nova York não conseguiria salvar o próprio telefone nem receber reservas de clientes locais (#189). Configurações oferece só fusos brasileiros. `createBusiness`, `updateBusiness` e o alinhamento com o Google Calendar recusam qualquer outro, mas qualquer fuso IANA do Brasil é aceito, não só os da lista. Um negócio que já tinha um fuso estrangeiro antes da regra pode mantê-lo, mas não pode trocar por outro fuso estrangeiro.

Num fuso com horário de verão, a hora local que não existe (o "buraco" de quando o relógio adianta) não vira slot, e a lista de espera também a recusa, porque ela seria gravada em outro instante (#190). A hora repetida de quando o relógio atrasa fica na primeira ocorrência. `localTimeExists` e `zonedTimeToUtcMs` (`lib/booking/availability.ts`) aplicam as duas regras. Os fusos brasileiros não têm horário de verão desde 2019, então isso só afeta negócios que ainda têm um fuso estrangeiro.

## Histórico

O produto chegou a operar com fuso único America/Sao_Paulo (`20260922000000_remove_timezone.sql`). O fuso por negócio voltou em `20261013000000_restore_business_timezone.sql`, com a trava em `20261015010000_business_timezone_guard.sql`. A conversão de bloqueios digitados no dashboard foi corrigida na issue #77.

## Fontes

- `CONTEXT.md` — "Fuso do negócio"
- `supabase/migrations/20261013000000_restore_business_timezone.sql`
- `supabase/migrations/20261015010000_business_timezone_guard.sql`

# 0005 — Token de cancelamento independente, armazenado só como digest

**Status:** aceito

O cancelamento self-service usa uma capability própria: na criação da reserva, a Server Action gera 32 bytes aleatórios (base64url), calcula o SHA-256 e passa só o digest para a RPC de criação, que o grava em `bookings.cancel_token_hash`. O token bruto é devolvido uma única vez ao navegador e vai no link do e-mail de confirmação. A conversão da lista de espera em reserva segue o mesmo contrato. A saída self-service da lista de espera também (#152): `join_waitlist` grava o digest em `waitlist_entries.cancel_token_hash`, o token vai no link do e-mail de entrada e `cancel_waitlist_entry_by_token` passa a entrada `pending`/`notified` para `cancelled`, com a resposta genérica `WAITLIST_CANCELLATION_REJECTED` em toda falha. Entrar de novo no mesmo horário troca o digest, então vale o link mais recente.

A RPC de cancelamento, restrita à service role, exige o digest e o compara na mesma transação com lock que muda o status. Todas as falhas têm a mesma resposta genérica. A única exceção vem depois de o digest bater: uma reserva confirmada cujo `start_at` já passou é recusada com `BOOKING_ALREADY_STARTED` (#141), que só revela algo a quem já detém o token, e preserva o no-show para o negócio registrar.

## Alternativas consideradas

- **HMAC do código público:** rejeitado, porque o token continuaria derivável pelo fluxo de confirmação renderizado.
- **Token em texto puro no banco:** rejeitado, porque o vazamento de uma linha daria poder de cancelar.
- **Gravar o digest depois do insert:** rejeitado, porque abre uma janela de falha parcial.

## Fontes

- `specs/006-security-response-hardening/research.md` — "Independent cancellation capability" e "Database-authoritative cancellation"
- `lib/bookings/cancel.ts`
- `supabase/migrations/20260929000000_security_response_hardening.sql`
- `supabase/migrations/20260929000001_fix_waitlist_cancel_token.sql`
- `supabase/migrations/20261022030000_waitlist_leave_token.sql`

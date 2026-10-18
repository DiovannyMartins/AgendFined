# 0005 — Token de cancelamento independente, armazenado só como digest

**Status:** aceito

O cancelamento self-service usa uma capability própria: na criação da reserva, a Server Action gera 32 bytes aleatórios (base64url), calcula o SHA-256 e passa só o digest para a RPC de criação, que o grava em `bookings.cancel_token_hash`. O token bruto é devolvido uma única vez ao navegador e vai no link do e-mail de confirmação. A conversão da lista de espera em reserva segue o mesmo contrato.

A RPC de cancelamento, restrita à service role, exige o digest e o compara na mesma transação com lock que muda o status. Todas as falhas têm a mesma resposta genérica.

## Alternativas consideradas

- **HMAC do código público:** rejeitado, porque o token continuaria derivável pelo fluxo de confirmação renderizado.
- **Token em texto puro no banco:** rejeitado, porque o vazamento de uma linha daria poder de cancelar.
- **Gravar o digest depois do insert:** rejeitado, porque abre uma janela de falha parcial.

## Fontes

- `specs/006-security-response-hardening/research.md` — "Independent cancellation capability" e "Database-authoritative cancellation"
- `lib/bookings/cancel.ts`
- `supabase/migrations/20260929000000_security_response_hardening.sql`
- `supabase/migrations/20260929000001_fix_waitlist_cancel_token.sql`

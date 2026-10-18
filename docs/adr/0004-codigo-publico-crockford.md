# 0004 — Código público curto em Crockford base32

**Status:** aceito

A reserva é identificada para o cliente por um código público de 8 caracteres no alfabeto Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), armazenado sem hífen e exibido agrupado (`AB12-CD34`). Ele substituiu um UUID de 36 caracteres, difícil de copiar e digitar. Na busca, o código digitado é normalizado: hífens e espaços saem, letras viram maiúsculas e as trocas do Crockford são aplicadas (O→0, I/L→1).

O código só identifica a reserva. Ele nunca autoriza acesso a dados do cliente nem mutação: o cancelamento usa outra credencial (ADR 0005). Os bits são gerados com aleatoriedade criptográfica do PostgreSQL, e a consulta pública tem limitador de tentativas que falha fechado.

## Alternativas consideradas

Aumentar o código para ganhar entropia foi adiado. Como o código só serve para consulta, o limitador, a amarração ao slug e as respostas de falha genéricas já eliminam o oráculo prático. Aumentar agora quebraria códigos já entregues; uma versão futura pode fazer isso sem mudar o contrato da consulta.

## Fontes

- `CONTEXT.md` — "Código público (public_code)"
- `supabase/migrations/20260915000000_short_public_code.sql`
- `specs/006-security-response-hardening/research.md` — "Secure public code generation"
- `specs/001-backend-security-concurrency-hardening/research.md` — "Public-code entropy"
- `lib/bookings/public-code.ts`

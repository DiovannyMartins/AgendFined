# 0006 — Leituras e escritas públicas por RPCs com allowlist

**Status:** aceito

O fluxo público (catálogo do negócio, consulta por código público, criação de reserva) não lê nem grava tabelas-base diretamente. Ele passa por funções `security definer` com `set search_path = ''` e tipo de retorno explícito, como `get_public_business`, `get_booking_by_public_code` e `create_booking`. A criação grava cliente e reserva na mesma transação. As RPCs de escrita são chamadas só no servidor, com a service role, depois da validação com Zod; a service role nunca chega ao navegador. O acesso anônimo às tabelas-base protegidas é revogado.

As RPCs `security definer` do dono seguem a mesma regra (#219): o GRANT por coluna em `bookings` e `waitlist_entries` não vale para o retorno de função, então `create_owner_booking`, `reschedule_owner_booking` e `convert_waitlist_entry` devolvem o tipo `public.owner_booking` e `notify_waitlist_entry` devolve `public.owner_waitlist_entry`, com só as colunas do GRANT, sem `cancel_token_hash` nem `reminder_claim_token`.

## Alternativas consideradas

Manter políticas públicas de SELECT e trocar `select(*)` por listas de colunas foi rejeitado: uma coluna nova ficaria pública automaticamente. A RPC com tipo de retorno explícito é uma allowlist estável. Só RLS também não basta: respostas vazias bem-sucedidas revelam o formato da API.

## Fontes

- `specs/001-backend-security-concurrency-hardening/research.md` — "Public catalog access"
- `specs/006-security-response-hardening/research.md` — "Explicit database privileges"
- README — "Arquitetura e fluxo de dados"
- `AGENTS.md` — "Arquitetura"
- `supabase/migrations/20261031020000_owner_rpc_return_columns.sql`

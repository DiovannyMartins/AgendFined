# 0003 — Exclusion constraint como guarda final contra sobreposição

**Status:** aceito

Duas reservas não canceladas do mesmo negócio não podem se sobrepor. Quem garante isso é o banco: uma exclusion constraint GiST em `bookings` sobre `business_id` e `tstzrange(start_at, end_at, '[)')`, com `where status <> 'cancelled'` (extensão `btree_gist`).

A aplicação também calcula slots livres e revalida a disponibilidade no servidor, mas essas verificações servem à experiência, não à correção: duas reservas concorrentes podem passar por elas ao mesmo tempo. A constraint é a última barreira e permite no máximo uma das duas. Os fluxos de criação de reserva e de lista de espera tratam o erro `23P01` como conflito de horário.

## Fontes

- `supabase/migrations/0004_indexes_and_constraints.sql`
- `specs/001-backend-security-concurrency-hardening/` — spec (cenário de reservas sobrepostas) e tasks T011
- README — "Arquitetura e fluxo de dados"

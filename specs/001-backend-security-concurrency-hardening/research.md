# Research Notes

## Evidence reviewed

- TypeSafe/Jev triage and manual review of migrations, Server Actions, Route Handlers, auth, and the reminder Edge Function.
- Installed Next.js 16.3 documentation: Server Actions are directly reachable POST endpoints and must authenticate/authorize inside every action; mutations should revalidate affected paths; Route Handlers are the backend-for-frontend boundary.
- Supabase/Postgres guidance: least privilege, indexed RLS predicates, fully qualified security-definer functions with an empty `search_path`, atomic `FOR UPDATE SKIP LOCKED` claims, short transactions, and database constraints as the final correctness boundary.

## Alternatives considered

### Public catalog access

Keep the public SELECT policies and replace `select(*)` with allowlists. Rejected: a future column added to either table would become public automatically. A security-definer RPC with an explicit return table is a stable allowlist.

### Reminder deduplication

Let the Edge Function post candidates and mark sent after delivery. Rejected: two invocations can read the same unmarked row before either marks it. A short database lease makes candidate ownership explicit.

### Service deletion race

Retain the existing precheck and rely on `ON DELETE SET NULL`. Rejected: a booking can be inserted after the precheck and lose its service link. Locking the service row in both create and delete serializes the invariant.

### Public-code entropy

Replace the existing code format immediately. Deferred for compatibility: rate limiting, slug binding, and generic failure responses remove the practical lookup oracle in this change. A future version can migrate to a longer code without changing the lookup contract.

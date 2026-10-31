-- cancel_token_hash é a capacidade do cliente para sair da lista de espera
-- (ADR 0005), não um dado do dono. Como em bookings
-- (20261027000000_security_hardening_grants_triggers), o SELECT de
-- waitlist_entries para authenticated passa a ser por coluna: a RLS filtra
-- linhas, não colunas. O dashboard (lib/waitlist/get-management.ts) lê só as
-- colunas abaixo; uma coluna nova em waitlist_entries precisa entrar aqui para
-- o dono enxergá-la. authenticated já não tem INSERT, UPDATE nem DELETE.
revoke select on table public.waitlist_entries from authenticated;
grant select (
  id,
  business_id,
  service_id,
  start_at,
  customer_name,
  customer_phone,
  customer_email,
  status,
  created_at
) on table public.waitlist_entries to authenticated;

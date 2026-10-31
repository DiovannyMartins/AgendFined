-- Índices para as consultas de ocupação do dia, bloqueios e lembretes (#218).
--
-- Ocupações do dia (getSlotsForDate, getSlotRange, freeSlots,
-- listOwnerFreeSlots) filtram por `start_at < :fim AND end_at > :inicio`.
-- Com só `(business_id, start_at)` a condição em `start_at` limita apenas por
-- cima e o plano varre todo o histórico do negócio anterior ao dia. Indexando
-- por `end_at`, a condição `end_at > :inicio` corta o histórico e sobra só o
-- dia (e as reservas futuras, que são poucas). O GiST da exclusion constraint
-- não ajuda porque as consultas não usam `&&`.
--
-- O índice de reservas não é parcial: o sync do Google (lib/google-calendar/
-- sync.ts) lê pela mesma chave tanto as confirmadas quanto as canceladas
-- (`status = 'cancelled' AND end_at >= …`), e um predicado `status <>
-- 'cancelled'` deixaria essa segunda leitura em seq scan. Nas ocupações o
-- status vira filtro sobre poucas linhas, sem diferença medida. Também serve
-- ao gatilho prevent_block_booking_overlap (`end_at > now()`).
create index if not exists idx_bookings_business_end
  on public.bookings (business_id, end_at);

create index if not exists idx_blocks_business_end
  on public.availability_blocks (business_id, end_at);

-- claim_due_reminders roda a cada 30 min sobre todos os negócios com
-- `status = 'confirmed' AND reminder_sent_at IS NULL AND start_at` numa janela
-- curta à frente. Nenhum índice começava por `start_at`, então era seq scan.
create index if not exists idx_bookings_reminder_due
  on public.bookings (start_at)
  where status = 'confirmed' and reminder_sent_at is null;

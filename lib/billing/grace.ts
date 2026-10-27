// End of the grace (carência) when a PROFISSIONAL assinatura stops (ADR 0008).
// Every grace lasts at least `graceDays` (7 by default). A cancellation of a
// paid assinatura also keeps the month already paid: the grace runs until the
// next charge date when that is later (issue #142). A failed payment
// (`paused`) passes no paid period, so it keeps only the minimum.
export const DEFAULT_GRACE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export function graceEnd(input: { now: Date; graceDays?: number; paidPeriodEnd?: string | null }): string {
  const minimum = input.now.getTime() + (input.graceDays ?? DEFAULT_GRACE_DAYS) * MS_PER_DAY;
  const paid = input.paidPeriodEnd ? Date.parse(input.paidPeriodEnd) : Number.NaN;
  return new Date(Number.isFinite(paid) && paid > minimum ? paid : minimum).toISOString();
}

// The carência to record when a provider snapshot is applied over the local
// assinatura, shared by the webhook and the checkout return so neither writes a
// `paused`/`cancelled` row without one. A checkout still `pending` locally was
// never paid and closes without a grace; a future grace already recorded is
// kept; only a cancellation of an assinatura still authorized keeps the paid
// month.
export function snapshotGraceEnd(input: {
  now: Date;
  graceDays?: number;
  localStatus: "pending" | "authorized" | "paused" | "cancelled";
  existingGracePeriodEnd: string | null;
  snapshotStatus: "pending" | "authorized" | "paused" | "cancelled";
  snapshotPeriodEnd: string | null;
}): string | null {
  if (input.snapshotStatus !== "paused" && input.snapshotStatus !== "cancelled") return null;
  if (input.localStatus === "pending") return null;
  const existing = input.existingGracePeriodEnd ? Date.parse(input.existingGracePeriodEnd) : Number.NaN;
  if (Number.isFinite(existing) && existing > input.now.getTime()) return new Date(existing).toISOString();
  const paidPeriodEnd =
    input.snapshotStatus === "cancelled" && input.localStatus === "authorized" ? input.snapshotPeriodEnd : null;
  return graceEnd({ now: input.now, graceDays: input.graceDays, paidPeriodEnd });
}

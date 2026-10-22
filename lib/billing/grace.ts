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

// When the first charge of a new assinatura happens (ADR 0013, FR-011). A dono
// who subscribes during the teste grátis keeps the days left: the preapproval
// gets `auto_recurring.start_date = trial_ends_at`. Outside a teste the charge
// starts now, which the provider expresses by omitting `start_date` (null).
//
// Mercado Pago refuses a past `start_date` and counts the free days in whole
// calendar days in its own time zone (UTC-4): a teste ending later the same day
// is charged right away, and the first charge falls on the day the teste ends,
// at the time of day the checkout was created. The few minutes of lead keep a
// teste about to end from reaching Mercado Pago as a past date.
//
// A negócio older than the plano único has `trial_ends_at = 'infinity'` until
// the virada (#261, fase 7). It is not a teste with an end to charge on, so it
// is charged now, as before the plano único.
import { parseTrialEndsAt } from "@/lib/plan/trial";

export const MIN_START_DATE_LEAD_MS = 10 * 60_000;

export function firstChargeDate(trialEndsAt: string | null | undefined, now: Date = new Date()): string | null {
  const end = parseTrialEndsAt(trialEndsAt);
  if (!end || end.getTime() - now.getTime() <= MIN_START_DATE_LEAD_MS) return null;
  return end.toISOString();
}

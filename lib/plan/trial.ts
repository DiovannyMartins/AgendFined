// The teste grátis as the painel shows it (ADR 0013). `businesses.trial_ends_at`
// arrives from PostgREST as a string, and null means "sem teste". The banco only
// keeps finite instants (businesses_trial_ends_at_finite, #261 fase 7); the
// value is still parsed here, once, and anything that is not a finite instant
// is "no trial to show", never an Invalid Date.

const DAY_MS = 86_400_000;

// The last days of the teste get the banner in destaque.
export const TRIAL_HIGHLIGHT_DAYS = 3;

export function parseTrialEndsAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

// Whole days left, rounded up: 30 days on the first day, 1 on the last one.
// null when there is no finite teste running at `now`.
export function trialDaysLeft(trialEndsAt: string | null | undefined, now: Date = new Date()): number | null {
  const end = parseTrialEndsAt(trialEndsAt);
  if (!end) return null;
  const left = end.getTime() - now.getTime();
  if (left <= 0) return null;
  return Math.ceil(left / DAY_MS);
}

export function trialBannerMessage(daysLeft: number): string {
  return daysLeft === 1
    ? "Falta 1 dia do seu teste grátis"
    : `Faltam ${daysLeft} dias do seu teste grátis`;
}

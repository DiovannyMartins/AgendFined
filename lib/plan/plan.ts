// Plan gate seam (ADR 0008). `businesses.plan` is the seat of the gate: a
// business is Pro only when its plan is exactly `pro`. `assertProPlan` is the
// server-side check every gated boundary (reports, reminders, waitlist
// management, calendar export) funnels through; it returns the agreed result
// shape so the caller can branch on it and surface an `UPGRADE_REQUIRED`
// response without leaking internals.

export type Plan = "free" | "pro";

export const BOOKING_WINDOW_LIMIT_DAYS: Record<Plan, number> = {
  free: 90,
  pro: 365,
};

export function getBookingWindowLimitDays(plan: Plan | null | undefined): number {
  return plan === "pro" ? BOOKING_WINDOW_LIMIT_DAYS.pro : BOOKING_WINDOW_LIMIT_DAYS.free;
}

export function getEffectiveBookingWindowDays(
  plan: Plan | null | undefined,
  configuredDays: number,
): number {
  return Math.min(configuredDays, getBookingWindowLimitDays(plan));
}

export type PlanGateResult = { ok: true } | { ok: false; code: "UPGRADE_REQUIRED" };

// Fail-closed: anything that isn't exactly "pro" (free, null, undefined) is not
// treated as Pro, so a missing/invalid plan can never open a Pro feature.
export function isProPlan(plan: Plan | null | undefined): boolean {
  return plan === "pro";
}

export function assertProPlan(business: { plan?: Plan | null }): PlanGateResult {
  if (isProPlan(business.plan)) return { ok: true };
  return { ok: false, code: "UPGRADE_REQUIRED" };
}

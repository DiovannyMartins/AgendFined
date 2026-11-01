// Billing seam types (ADR 0008). The `subscriptions` table stores the Mercado
// Pago preapproval data of the Plano AgendFined, the only plan (ADR 0013);
// access is `business_has_access()`, computed in the database. These types are
// provider-agnostic — the concrete provider (Mercado Pago) lives behind
// `BillingProvider` (provider.ts).

export type SubscriptionStatus = "pending" | "authorized" | "paused" | "cancelled";

// The current subscription as shown in the dashboard. Maps one-to-one to a row
// in `public.subscriptions`, but with snake_case keys re-mapped to camelCase so
// the UI never leaks the database column names. `gracePeriodEnd` is optional to
// keep existing callers compiling; new reads populate it from the row.
export interface BillingSubscription {
  subscriptionId?: string;
  mpPreapprovalId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEnd?: string | null;
  // Set by the database on the row's first authorization, never cleared.
  firstAuthorizedAt?: string | null;
}

// A `cancelled`/`paused` subscription is no longer being charged and sits in the
// grace window (carência): the negócio keeps its access until the grace
// expires, then is suspended (ADR 0013).
export function isSubscriptionInGrace(status: SubscriptionStatus | null | undefined): boolean {
  return status === "cancelled" || status === "paused";
}

// True when a grace timestamp is still in the future. Used by the dashboard to
// distinguish "pending with an older grace still active" (keeps the access
// until the grace lapses) from a plain "pending".
export function isGraceActive(gracePeriodEnd: string | null | undefined, now: Date = new Date()): boolean {
  if (!gracePeriodEnd) return false;
  return new Date(gracePeriodEnd).getTime() >= now.getTime();
}

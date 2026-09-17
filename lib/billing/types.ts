// Billing seam types (ADR 0008). The plan is the seat of the gate
// (`businesses.plan`, free | pro); the `subscriptions` table stores the Mercado
// Pago preapproval data. These types are provider-agnostic — the concrete
// provider (Mercado Pago) lives behind `BillingProvider` (provider.ts). The plan
// type is reused from the plan gate seam (`lib/plan/plan.ts`) so there is a
// single source of truth for `free | pro`.
import type { Plan } from "@/lib/plan/plan";

export type BillingPlan = Plan;

export type SubscriptionStatus = "pending" | "authorized" | "paused" | "cancelled";

// The current subscription as shown in the dashboard. Maps one-to-one to a row
// in `public.subscriptions`, but with snake_case keys re-mapped to camelCase so
// the UI never leaks the database column names. `gracePeriodEnd` is optional to
// keep existing callers compiling; new reads populate it from the row.
export interface BillingSubscription {
  subscriptionId?: string;
  mpPreapprovalId: string;
  status: SubscriptionStatus;
  plan: BillingPlan;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEnd?: string | null;
}

// A `cancelled`/`paused` subscription is no longer being charged and sits in the
// grace window (carência): the business keeps Pro features until the grace
// expires. Used to decide whether a Pro business may start a fresh preapproval
// (re-subscribe) and whether the re-subscribe CTA should show.
export function isSubscriptionInGrace(status: SubscriptionStatus | null | undefined): boolean {
  return status === "cancelled" || status === "paused";
}

// True when a grace timestamp is still in the future. Used by the dashboard to
// distinguish "pending with an older grace still active" (stays Pro until the
// grace lapses) from a plain "pending" (still Free).
export function isGraceActive(gracePeriodEnd: string | null | undefined, now: Date = new Date()): boolean {
  if (!gracePeriodEnd) return false;
  return new Date(gracePeriodEnd).getTime() >= now.getTime();
}

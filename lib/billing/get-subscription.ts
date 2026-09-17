// Server-side retrieval of the business's current subscription (ADR 0008). It
// resolves the latest `subscriptions` row for a business (RLS scopes it to the
// owner) and returns it alongside the plan that is the seat of the gate. The
// seat of the gate is `businesses.plan` (free | pro), which is what the
// dashboard displays and what `assertProPlan` checks; the subscription row's own
// `plan` column is always `pro` (a subscription represents the paid plan), so
// the returned `plan` is the business's, not the row's. The fetch is injectable
// so the boundary can be exercised against a real user-scoped client in the
// integration tests.
import { createClient } from "@/lib/supabase/server";
import type { BillingPlan, BillingSubscription, SubscriptionStatus } from "./types";
import { isGraceActive } from "./types";

export type FetchSubscription = (businessId: string) => Promise<BillingSubscription | null>;
export type FetchGraceSubscription = (businessId: string) => Promise<BillingSubscription | null>;

export interface GetSubscriptionResult {
  plan: BillingPlan;
  subscription: BillingSubscription | null;
  // Older `paused`/`cancelled` row whose grace is still active. Only populated
  // when the current row is `pending` on a Pro business (re-subscribe during
  // the grace window, US16): the current row hides the grace, but the gate
  // (`businesses.plan`) still grants Pro until it lapses. Null otherwise.
  graceSubscription: BillingSubscription | null;
}

// Maps a `subscriptions` DB row to the provider-agnostic shape. A subscription
// row always represents the paid (Pro) plan, so the row's `plan` is carried
// through as-is (it is `pro`).
function mapRow(row: {
  id: string;
  mp_preapproval_id: string;
  status: SubscriptionStatus;
  plan: BillingPlan;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_period_end?: string | null;
}): BillingSubscription {
  return {
    subscriptionId: row.id,
    mpPreapprovalId: row.mp_preapproval_id,
    status: row.status,
    plan: row.plan,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    gracePeriodEnd: row.grace_period_end ?? null,
  };
}

// Default fetch: the owner's own rows, scoped by RLS. A business can hold more
// than one subscription row over time (re-subscription); the most recently
// created one is the current. Shared by the dashboard read and by the upgrade
// action's pending-guard.
export const fetchCurrentSubscription: FetchSubscription = async (businessId) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data) : null;
};

// Newest `paused`/`cancelled` row with a grace still in the future (owner RLS).
// Used only to explain the pending-during-grace state; the downgrade RPC
// remains the authority for expiring the grace.
export const fetchActiveGraceSubscription: FetchGraceSubscription = async (businessId) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .in("status", ["paused", "cancelled"])
    .not("grace_period_end", "is", null)
    .gte("grace_period_end", new Date().toISOString())
    .order("grace_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data) : null;
};

export async function getSubscription(
  business: { id: string; plan: BillingPlan },
  deps?: {
    fetchSubscription?: FetchSubscription;
    fetchGraceSubscription?: FetchGraceSubscription;
    now?: () => Date;
  },
): Promise<GetSubscriptionResult> {
  const fetchSubscription = deps?.fetchSubscription ?? fetchCurrentSubscription;
  const subscription = await fetchSubscription(business.id);

  // The pending-during-grace case: the latest row is `pending` (new checkout)
  // while an older `paused`/`cancelled` row still holds an active grace. The UI
  // needs that older row to explain why a "pending" business still has Pro.
  let graceSubscription: BillingSubscription | null = null;
  if (subscription?.status === "pending" && business.plan === "pro") {
    const fetchGrace = deps?.fetchGraceSubscription ?? fetchActiveGraceSubscription;
    try {
      const grace = await fetchGrace(business.id);
      const now = deps?.now?.() ?? new Date();
      if (grace && isGraceActive(grace.gracePeriodEnd, now)) {
        graceSubscription = grace;
      }
    } catch {
      graceSubscription = null;
    }
  }
  return { plan: business.plan, subscription, graceSubscription };
}

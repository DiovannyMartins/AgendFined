// Server-side retrieval of the business's current subscription (ADR 0008). It
// resolves the latest `subscriptions` row for a business (RLS scopes it to the
// owner). Access itself is `business_has_access()` (ADR 0013); this read only
// explains the assinatura and its carência to the painel. The fetch is injectable
// so the boundary can be exercised against a real user-scoped client in the
// integration tests.
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BillingSubscription, SubscriptionStatus } from "./types";
import { isGraceActive } from "./types";

// `currentSubscriptionId` is the negócio's `businesses.current_subscription_id`
// when the caller already loaded it (#214); left undefined, it is read here.
export type FetchSubscription = (
  businessId: string,
  currentSubscriptionId?: string | null,
) => Promise<BillingSubscription | null>;
export type FetchGraceSubscription = (businessId: string) => Promise<BillingSubscription | null>;

export interface GetSubscriptionResult {
  subscription: BillingSubscription | null;
  // Older `paused`/`cancelled` row whose grace is still active. Only populated
  // when the current row is `pending` (re-subscribe during the grace window,
  // US16): the current row hides the grace, but `business_has_access()` still
  // grants access until it lapses. Null otherwise.
  graceSubscription: BillingSubscription | null;
}

// Maps a `subscriptions` DB row to the provider-agnostic shape.
function mapRow(row: {
  id: string;
  mp_preapproval_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_period_end?: string | null;
  first_authorized_at?: string | null;
}): BillingSubscription {
  return {
    subscriptionId: row.id,
    mpPreapprovalId: row.mp_preapproval_id,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    gracePeriodEnd: row.grace_period_end ?? null,
    firstAuthorizedAt: row.first_authorized_at ?? null,
  };
}

// Default fetch: the owner's own rows, scoped by RLS. A business can hold more
// than one subscription row over time (re-subscription); the most recently
// created one is the current. Shared by the dashboard read and by the upgrade
// action's pending-guard.
export const fetchCurrentSubscription: FetchSubscription = async (businessId, knownSubscriptionId) => {
  const supabase = await createClient();
  let currentSubscriptionId = knownSubscriptionId;
  if (currentSubscriptionId === undefined) {
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("current_subscription_id")
      .eq("id", businessId)
      .maybeSingle();
    if (businessError) throw new Error(businessError.message);
    currentSubscriptionId = business?.current_subscription_id ?? null;
  }
  if (!currentSubscriptionId) return null;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", currentSubscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data) : null;
};

// Newest `paused`/`cancelled` row with a grace still in the future (owner RLS).
// Used only to explain the pending-during-grace state; `business_has_access()`
// remains the authority for the grace.
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

type SubscriptionBusiness = { id: string; currentSubscriptionId?: string | null };
type SubscriptionDeps = {
  fetchSubscription?: FetchSubscription;
  fetchGraceSubscription?: FetchGraceSubscription;
  now?: () => Date;
};

// Keyed by primitives so the GraceBanner and the "Plano" section share one read
// per request (#214).
const getCachedSubscription = cache(
  (id: string, currentSubscriptionId: string | null | undefined) => loadSubscription({ id, currentSubscriptionId }),
);

export function getSubscription(
  business: SubscriptionBusiness,
  deps?: SubscriptionDeps,
): Promise<GetSubscriptionResult> {
  if (deps) return loadSubscription(business, deps);
  return getCachedSubscription(business.id, business.currentSubscriptionId);
}

async function loadSubscription(
  business: SubscriptionBusiness,
  deps?: SubscriptionDeps,
): Promise<GetSubscriptionResult> {
  // No current row on the negócio: nothing to read in `subscriptions` (#214).
  if (business.currentSubscriptionId === null) {
    return { subscription: null, graceSubscription: null };
  }
  const fetchSubscription = deps?.fetchSubscription ?? fetchCurrentSubscription;
  const subscription = await fetchSubscription(business.id, business.currentSubscriptionId);

  // The pending-during-grace case: the latest row is `pending` (new checkout)
  // while an older `paused`/`cancelled` row still holds an active grace. The UI
  // needs that older row to explain why a "pending" negócio still has access.
  let graceSubscription: BillingSubscription | null = null;
  if (subscription?.status === "pending") {
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
  return { subscription, graceSubscription };
}

import type { Preapproval } from "./provider";
import type { AppliedSubscriptionSnapshot, ApplySubscriptionSnapshotInput } from "./handle-webhook";
import type { BillingSubscription } from "./types";

export type ReturnSyncResult =
  | { ok: true; status: Preapproval["status"]; effectivePlan: "free" | "pro" }
  | { ok: true; status: "none"; effectivePlan: null }
  | { ok: false; code: "SUBSCRIPTION_ID_MISSING" };

export interface ReturnSyncDeps {
  fetchSubscription: (businessId: string) => Promise<BillingSubscription | null>;
  getPreapproval: (id: string) => Promise<Preapproval>;
  applySnapshot: (input: ApplySubscriptionSnapshotInput) => Promise<AppliedSubscriptionSnapshot>;
}

/**
 * Re-checks the provider after checkout returns. The provider remains the
 * source of truth: only its `authorized` snapshot can make the database plan
 * Pro. Webhooks still handle the normal lifecycle; this closes the small race
 * where the payer returns before the webhook reaches the app.
 */
export async function syncReturnedSubscription(
  businessId: string,
  deps: ReturnSyncDeps,
): Promise<ReturnSyncResult> {
  const current = await deps.fetchSubscription(businessId);
  if (!current) return { ok: true, status: "none", effectivePlan: null };
  if (!current.subscriptionId) return { ok: false, code: "SUBSCRIPTION_ID_MISSING" };

  const snapshot = await deps.getPreapproval(current.mpPreapprovalId);
  if (snapshot.id !== current.mpPreapprovalId) {
    throw new Error("PREAPPROVAL_ID_MISMATCH");
  }

  const input: ApplySubscriptionSnapshotInput = {
    businessId,
    subscriptionId: current.subscriptionId,
    mpPreapprovalId: current.mpPreapprovalId,
    status: snapshot.status,
    currentPeriodStart: snapshot.currentPeriodStart,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    gracePeriodEnd:
      snapshot.status === "paused" || snapshot.status === "cancelled"
        ? current.gracePeriodEnd ?? null
        : null,
  };
  const applied = await deps.applySnapshot(input);

  return {
    ok: true,
    status: snapshot.status,
    effectivePlan: applied.effectivePlan,
  };
}

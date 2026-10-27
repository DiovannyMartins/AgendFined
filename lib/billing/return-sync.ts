import type { Preapproval } from "./provider";
import type { AppliedSubscriptionSnapshot, ApplySubscriptionSnapshotInput } from "./handle-webhook";
import type { BillingSubscription } from "./types";
import { refuseUnacceptedCheckout, type CheckoutTermsDeps, type CheckoutTermsRefusal } from "./checkout-terms";
import { snapshotGraceEnd } from "./grace";

export type ReturnSyncResult =
  | { ok: true; status: Preapproval["status"]; effectivePlan: "free" | "pro" }
  | { ok: true; status: "refused"; refusal: CheckoutTermsRefusal; effectivePlan: null }
  | { ok: true; status: "none"; effectivePlan: null }
  | { ok: false; code: "SUBSCRIPTION_ID_MISSING" };

export interface ReturnSyncDeps extends CheckoutTermsDeps {
  fetchSubscription: (businessId: string) => Promise<BillingSubscription | null>;
  getPreapproval: (id: string) => Promise<Preapproval>;
  applySnapshot: (input: ApplySubscriptionSnapshotInput) => Promise<AppliedSubscriptionSnapshot>;
  graceDays?: number;
  now?: () => Date;
}

/**
 * Re-checks the provider after checkout returns. The provider remains the
 * source of truth: only its `authorized` snapshot can make the database plan
 * Pro. Webhooks still handle the normal lifecycle; this closes the small race
 * where the payer returns before the webhook reaches the app. A first
 * authorization with terms the plan does not sell is refused here as the
 * webhook would: applying it would make the webhook skip the check.
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

  const refusal = await refuseUnacceptedCheckout(
    { businessId, mpPreapprovalId: current.mpPreapprovalId, snapshot, localStatus: current.status },
    deps,
  );
  if (refusal) return { ok: true, status: "refused", refusal, effectivePlan: null };

  const input: ApplySubscriptionSnapshotInput = {
    businessId,
    subscriptionId: current.subscriptionId,
    mpPreapprovalId: current.mpPreapprovalId,
    status: snapshot.status,
    currentPeriodStart: snapshot.currentPeriodStart,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    // Computed as the webhook does: this GET can reach the database first, and
    // a `paused`/`cancelled` row without a carência would let the downgrade
    // cron drop the negócio before the webhook arrives.
    gracePeriodEnd: snapshotGraceEnd({
      now: deps.now?.() ?? new Date(),
      graceDays: deps.graceDays,
      localStatus: current.status,
      existingGracePeriodEnd: current.gracePeriodEnd ?? null,
      snapshotStatus: snapshot.status,
      snapshotPeriodEnd: snapshot.currentPeriodEnd,
    }),
    providerModifiedAt: snapshot.lastModified ?? null,
  };
  const applied = await deps.applySnapshot(input);

  // A snapshot older than the stored one is refused by the database; the
  // stored state is what the negócio has.
  return {
    ok: true,
    status: applied.subscriptionStatus,
    effectivePlan: applied.effectivePlan,
  };
}

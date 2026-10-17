// Mercado Pago webhook lifecycle seam (issue #24). Maps a `preapproval`
// notification (delivered with `type: "subscription_preapproval"`, and accepted
// here as `preapproval` for older/legacy accounts) onto the plan state,
// following ADR 0008:
//   * `authorized`  -> the business becomes Pro; the subscription is authorized.
//     The negócio's other pending checkouts (left payable by a retry) are
//     cancelled. A paid superseded checkout becomes the current subscription
//     while the current one is unpaid; when the current one is already paid,
//     the extra one is cancelled and reported as a double charge.
//   * `paused`/`cancelled` (incl. a failed recurring payment, which Mercado Pago
//     surfaces as `paused`) -> start a 7-day grace period. The business stays
//     Pro during the grace; the downgrade happens after it expires (the
//     `downgrade_expired_subscriptions` RPC, scheduled via pg_cron). A checkout
//     that was never paid closes without a grace.
//   * `pending` -> just record the subscription status; never touches the plan.
// The persistence (find/create subscription, set plan, update subscription) is
// injected so the decision core is unit-testable without a database, and the
// plan is never set from the provider's word alone — `authorized` is the only
// path that makes a business Pro, and a missing/invalid status fails closed.
import type { SubscriptionStatus } from "./types";

// The current state of a preapproval, as read from the provider (`GET
// /preapproval/{id}`). `externalReference` is the caller's `external_reference`,
// i.e. the business id, used to locate the business when the subscription row is
// not yet known.
export interface PreapprovalResource {
  status: SubscriptionStatus;
  externalReference: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  // The recurring charge in reais, fixed when the checkout was created.
  transactionAmount: number | null;
}

export interface WebhookEvent {
  type: string;
  dataId: string;
}

export interface SubscriptionForWebhook {
  id: string;
  businessId: string;
  mpPreapprovalId: string;
  status: SubscriptionStatus;
  gracePeriodEnd: string | null;
}

export interface AppliedSubscriptionSnapshot {
  subscriptionId: string;
  businessId: string;
  subscriptionStatus: SubscriptionStatus;
  isCurrent: boolean;
  effectivePlan: "free" | "pro";
  effectiveGracePeriodEnd: string | null;
}

export interface ApplySubscriptionSnapshotInput {
  businessId: string;
  subscriptionId: string;
  mpPreapprovalId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
  // Repoint the negócio at this subscription, compare-and-swap against the
  // current one read before the call.
  makeCurrent?: { expectedCurrentSubscriptionId: string | null };
}

export interface HandleWebhookDeps {
  event: WebhookEvent;
  getPreapproval: (dataId: string) => Promise<PreapprovalResource>;
  findSubscription: (mpPreapprovalId: string) => Promise<SubscriptionForWebhook | null>;
  applySnapshot: (input: ApplySubscriptionSnapshotInput) => Promise<AppliedSubscriptionSnapshot>;
  findCurrentSubscription: (businessId: string) => Promise<SubscriptionForWebhook | null>;
  // The negócio's other `pending` checkouts. A retry leaves the replaced
  // checkout payable; once one assinatura is authorized they are cancelled so a
  // stale link cannot charge the payer a second time.
  listOtherPendingSubscriptions: (businessId: string, exceptSubscriptionId: string) => Promise<SubscriptionForWebhook[]>;
  cancelPreapproval: (mpPreapprovalId: string) => Promise<void>;
  // A second checkout was paid while the negócio already had an authorized
  // assinatura. Its recurrence is cancelled; the charge already taken needs a
  // manual refund, so it is reported.
  reportDoubleCharge: (input: { businessId: string; mpPreapprovalId: string }) => void | Promise<void>;
  // The PROFISSIONAL price now (`getProPriceCents`). A checkout paid below it
  // was created before a price change; it is cancelled instead of activated and
  // the charge is reported for a manual refund.
  currentPriceCents: number;
  reportStalePriceCharge: (input: { businessId: string; mpPreapprovalId: string }) => void | Promise<void>;
  graceDays?: number;
  now?: () => Date;
}

export type HandleWebhookResult =
  | { ok: true; applied: "authorized" | "duplicate" | "stale_price" | "grace" | "closed" | "pending" | "ignored" }
  | { ok: false; code: string; message: string };

const DEFAULT_GRACE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

// The `type` values Mercado Pago sends for a preapproval (subscription)
// lifecycle notification. Current accounts use `subscription_preapproval`; the
// legacy value `preapproval` is kept for older integrations.
const PREAPPROVAL_EVENT_TYPES = new Set(["preapproval", "subscription_preapproval"]);

export async function handleWebhook(deps: HandleWebhookDeps): Promise<HandleWebhookResult> {
  const { event } = deps;
  if (!PREAPPROVAL_EVENT_TYPES.has(event.type)) {
    // Non-subscription topics (e.g. `payment`, `subscription_authorized_payment`)
    // are acknowledged and ignored; a failed recurring payment surfaces as the
    // preapproval becoming `paused`, which arrives on the preapproval topic.
    return { ok: true, applied: "ignored" };
  }

  let preapproval: PreapprovalResource;
  try {
    preapproval = await deps.getPreapproval(event.dataId);
  } catch (err) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível consultar a assinatura no provedor.",
    };
  }

  const sub = await deps.findSubscription(event.dataId);
  // Never trust external_reference as authorization to grant Pro. A valid
  // provider notification can refer to a preapproval created outside this
  // application, and its external_reference is provider-controlled input.
  // Returning an error makes the route answer 5xx so Mercado Pago retries; this
  // also covers the short race where a new retry preapproval notifies before its
  // local row has been repointed.
  if (!sub) {
    return {
      ok: false,
      code: "UNKNOWN_SUBSCRIPTION",
      message: "A assinatura recebida não está registrada neste sistema.",
    };
  }
  const businessId = sub.businessId;

  // Only the first authorization is checked: an assinatura already authorized
  // at an older price keeps renewing at that price.
  if (
    preapproval.status === "authorized" &&
    sub.status === "pending" &&
    preapproval.transactionAmount !== null &&
    Math.round(preapproval.transactionAmount * 100) < deps.currentPriceCents
  ) {
    await deps.reportStalePriceCharge({ businessId, mpPreapprovalId: event.dataId });
    try {
      await deps.cancelPreapproval(event.dataId);
    } catch (err) {
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        message: err instanceof Error ? err.message : "Não foi possível cancelar o checkout com preço antigo.",
      };
    }
    return { ok: true, applied: "stale_price" };
  }

  const now = deps.now?.() ?? new Date();
  // A checkout still `pending` locally never made the negócio PROFISSIONAL, so
  // closing it (e.g. a superseded checkout cancelled below) keeps no grace.
  const closedUnpaid =
    sub.status === "pending" && (preapproval.status === "paused" || preapproval.status === "cancelled");
  let gracePeriodEnd: string | null = null;
  if (!closedUnpaid && (preapproval.status === "paused" || preapproval.status === "cancelled")) {
    const existingGrace = sub.gracePeriodEnd ? new Date(sub.gracePeriodEnd) : null;
    gracePeriodEnd =
      existingGrace && existingGrace.getTime() > now.getTime()
        ? existingGrace.toISOString()
        : new Date(now.getTime() + (deps.graceDays ?? DEFAULT_GRACE_DAYS) * MS_PER_DAY).toISOString();
  }

  let superseded: SubscriptionForWebhook[] = [];
  let duplicate = false;
  try {
    // The payer paid a checkout that a retry had replaced. While the current
    // one is still unpaid, the paid checkout becomes the current assinatura;
    // when the current one is already paid, this one is a double charge.
    let makeCurrent: ApplySubscriptionSnapshotInput["makeCurrent"];
    if (preapproval.status === "authorized") {
      const current = await deps.findCurrentSubscription(businessId);
      if (current?.id !== sub.id) {
        if (current?.status === "authorized") duplicate = true;
        else makeCurrent = { expectedCurrentSubscriptionId: current?.id ?? null };
      }
    }

    const applied = await deps.applySnapshot({
      businessId,
      subscriptionId: sub.id,
      mpPreapprovalId: event.dataId,
      status: preapproval.status,
      currentPeriodStart: preapproval.currentPeriodStart,
      currentPeriodEnd: preapproval.currentPeriodEnd,
      gracePeriodEnd,
      ...(makeCurrent ? { makeCurrent } : {}),
    });

    if (duplicate) {
      superseded = [sub];
    } else if (preapproval.status === "authorized" && applied.isCurrent) {
      superseded = await deps.listOtherPendingSubscriptions(businessId, sub.id);
    }
  } catch (err) {
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível aplicar o estado da assinatura.",
    };
  }

  // Reported before cancelling so a refund is never lost to a failed cancel; a
  // Mercado Pago retry may report it again. Cancelling is idempotent at the
  // provider, so a failure answers 5xx and the retry runs the whole
  // notification again.
  if (duplicate) await deps.reportDoubleCharge({ businessId, mpPreapprovalId: event.dataId });
  try {
    for (const other of superseded) {
      // A superseded checkout still `pending` locally may already be paid,
      // with its own notification not processed yet.
      if (!duplicate && (await deps.getPreapproval(other.mpPreapprovalId)).status === "authorized") {
        await deps.reportDoubleCharge({ businessId, mpPreapprovalId: other.mpPreapprovalId });
      }
      await deps.cancelPreapproval(other.mpPreapprovalId);
    }
  } catch (err) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível cancelar um checkout substituído.",
    };
  }

  if (duplicate) return { ok: true, applied: "duplicate" };
  if (closedUnpaid) return { ok: true, applied: "closed" };
  if (preapproval.status === "authorized") return { ok: true, applied: "authorized" };
  if (preapproval.status === "paused" || preapproval.status === "cancelled") {
    return { ok: true, applied: "grace" };
  }
  return { ok: true, applied: "pending" };
}

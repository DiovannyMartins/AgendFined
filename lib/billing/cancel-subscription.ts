// User-initiated subscription cancellation (US16, ADR 0008). `cancelSubscription`
// is the pure decision core: it cancels the active preapproval at the provider
// (so the owner stops being charged) and records the `cancelled` status with a
// grace period, mirroring the webhook lifecycle for a `cancelled` preapproval.
// The grace keeps the month already paid (the preapproval's next charge date,
// read before cancelling) and never less than 7 days (issue #142).
// The business stays Pro during the grace; the `downgrade_expired_subscriptions`
// cron drops it to Free once the grace passes (data preserved). The provider and
// persistence are injectable so this seam is unit-testable without Mercado Pago
// or a database.
import type { BillingPlan, SubscriptionStatus } from "./types";
import type { BillingProvider } from "./provider";
import type { FetchSubscription } from "./get-subscription";
import { graceEnd } from "./grace";

export type CancelSubscriptionResult = { ok: true } | { ok: false; code: string; message: string };

export interface CancelSubscriptionDeps {
  business: { id: string; plan: BillingPlan };
  provider: BillingProvider;
  fetchSubscription: FetchSubscription;
  updateSubscription: (
    mpPreapprovalId: string,
    update: { status?: SubscriptionStatus; gracePeriodEnd?: string | null },
  ) => Promise<void>;
  graceDays?: number;
  now?: () => Date;
}

export async function cancelSubscription(deps: CancelSubscriptionDeps): Promise<CancelSubscriptionResult> {
  const subscription = await deps.fetchSubscription(deps.business.id);
  if (!subscription || subscription.status !== "authorized") {
    return {
      ok: false,
      code: "NO_ACTIVE_SUBSCRIPTION",
      message: "Você não tem uma assinatura ativa para cancelar.",
    };
  }

  // The local `current_period_end` is not trusted for this: rows written before
  // the provider mapped `next_payment_date` have it null. Read the paid period
  // first, so a failed read leaves the assinatura untouched and safe to retry.
  let paidPeriodEnd: string | null;
  try {
    paidPeriodEnd = (await deps.provider.getPreapproval(subscription.mpPreapprovalId)).currentPeriodEnd;
    await deps.provider.cancelPreapproval(subscription.mpPreapprovalId);
  } catch {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: "Não foi possível cancelar a assinatura. Tente novamente.",
    };
  }

  const now = deps.now?.() ?? new Date();
  try {
    await deps.updateSubscription(subscription.mpPreapprovalId, {
      status: "cancelled",
      gracePeriodEnd: graceEnd({ now, graceDays: deps.graceDays, paidPeriodEnd }),
    });
  } catch {
    // The provider cancellation already succeeded. Surface the persistence
    // failure explicitly so the caller can retry/reconcile the local state;
    // do not report success while the dashboard still says authorized.
    return {
      ok: false,
      code: "SAVE_ERROR",
      message: "A assinatura foi cancelada, mas a atualização está pendente. Contate o suporte.",
    };
  }

  return { ok: true };
}

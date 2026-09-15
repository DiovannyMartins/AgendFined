// User-initiated subscription cancellation (US16, ADR 0008). `cancelSubscription`
// is the pure decision core: it cancels the active preapproval at the provider
// (so the owner stops being charged) and records the `cancelled` status with a
// grace period, mirroring the webhook lifecycle for a `cancelled` preapproval.
// The business stays Pro during the grace; the `downgrade_expired_subscriptions`
// cron drops it to Free once the grace passes (data preserved). The provider and
// persistence are injectable so this seam is unit-testable without Mercado Pago
// or a database.
import type { BillingPlan, SubscriptionStatus } from "./types";
import type { BillingProvider } from "./provider";
import type { FetchSubscription } from "./get-subscription";

const DEFAULT_GRACE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

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

  try {
    await deps.provider.cancelPreapproval(subscription.mpPreapprovalId);
  } catch (err) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível cancelar a assinatura no provedor.",
    };
  }

  const now = deps.now?.() ?? new Date();
  try {
    await deps.updateSubscription(subscription.mpPreapprovalId, {
      status: "cancelled",
      gracePeriodEnd: new Date(
        now.getTime() + (deps.graceDays ?? DEFAULT_GRACE_DAYS) * MS_PER_DAY,
      ).toISOString(),
    });
  } catch (err) {
    // The provider cancellation already succeeded. Surface the persistence
    // failure explicitly so the caller can retry/reconcile the local state;
    // do not report success while the dashboard still says authorized.
    return {
      ok: false,
      code: "SAVE_ERROR",
      message: err instanceof Error ? err.message : "A assinatura foi cancelada, mas não foi possível atualizar o sistema.",
    };
  }

  return { ok: true };
}

// Retry seam for an abandoned checkout (ADR 0008). `startUpgrade` deliberately
// blocks a second preapproval while one is `pending` (avoids orphaned
// preapprovals from double-clicking), but that leaves the owner with no way to
// pay if the checkout tab was closed: the `init_point` is only returned once
// and is not stored. `retryPendingUpgrade` closes that dead-end: when the
// current subscription is `pending`, it creates a FRESH preapproval and points
// the pending row at the new id, then returns the new `init_point`.
// The old pending preapproval is cancelled best-effort (ignored on failure —
// an unpaid pending preapproval is harmless, and a late webhook authorizing it
// still lands the business on Pro, which is the desired end state anyway).
// The provider, the read and the replace are injectable so this seam is
// testable without Mercado Pago or a database. Never touches `businesses.plan`.
import type { BillingProvider } from "./provider";
import type { FetchSubscription } from "./get-subscription";

export type ReplaceSubscription = (oldMpPreapprovalId: string, input: { mpPreapprovalId: string }) => Promise<void>;

export type RetryUpgradeResult = { ok: true; initPoint: string } | { ok: false; code: string; message: string };

export interface RetryUpgradeDeps {
  business: { id: string };
  provider: BillingProvider;
  fetchSubscription: FetchSubscription;
  replaceSubscription: ReplaceSubscription;
  backUrl: string;
  payerEmail?: string;
  // Where Mercado Pago POSTs subscription webhook notifications (the tunnel /
  // deployed `/api/webhooks/mercadopago` URL). Required for subscriptions.
  notificationUrl?: string;
}

export async function retryPendingUpgrade(deps: RetryUpgradeDeps): Promise<RetryUpgradeResult> {
  const { business, provider, fetchSubscription, replaceSubscription, backUrl, payerEmail, notificationUrl } = deps;

  const existing = await fetchSubscription(business.id);
  if (!existing || existing.status !== "pending") {
    return {
      ok: false,
      code: "NO_PENDING_SUBSCRIPTION",
      message: "Você não tem um pagamento pendente para concluir.",
    };
  }

  let created;
  try {
    created = await provider.createPreapproval({
      plan: "pro",
      externalReference: business.id,
      payerEmail,
      backUrl,
      notificationUrl,
    });
  } catch (err) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível gerar um novo link de pagamento.",
    };
  }

  // Best-effort: abandon the stale pending preapproval at the provider so only
  // the new checkout can be paid. Never fails the retry.
  try {
    await provider.cancelPreapproval(existing.mpPreapprovalId);
  } catch {
    // Ignored: the old pending link simply stays unusable/unpaid.
  }

  try {
    await replaceSubscription(existing.mpPreapprovalId, { mpPreapprovalId: created.preapprovalId });
  } catch (err) {
    return {
      ok: false,
      code: "SAVE_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível atualizar a assinatura.",
    };
  }

  return { ok: true, initPoint: created.initPoint };
}

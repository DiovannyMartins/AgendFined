// The upgrade seam (ADR 0008). `startUpgrade` creates a Mercado Pago preapproval
// for the PROFISSIONAL plan through the `BillingProvider` interface
// and persists a `pending` subscription row, then returns the checkout
// `init_point` for the caller to redirect to. The provider, the
// subscription-save and the (optional) subscription read are injectable, so this
// seam is testable without Mercado Pago or a database. The plan only becomes
// `pro` once the preapproval is `authorized` (webhook lifecycle, issue #24) —
// this function never touches `businesses.plan`.
import { isProPlan } from "@/lib/plan/plan";
import { isSubscriptionInGrace, type BillingPlan, type BillingSubscription } from "./types";
import type { BillingProvider } from "./provider";
import type { FetchSubscription } from "./get-subscription";
import { MercadoPagoAmbiguousError } from "./mercado-pago";
import { refuseCheckoutOverLimits, type CheckoutLimits } from "./checkout-limits";
import { randomUUID } from "node:crypto";

export type BillingAttempt = {
  id: string;
  businessId: string;
  kind: "initial" | "retry";
  status: "reserved" | "creating" | "unknown" | "linked" | "failed" | "ambiguous";
  idempotencyKey: string;
  providerPreapprovalId: string | null;
};

export type StartUpgradeResult =
  | { ok: true; initPoint: string }
  | { ok: false; code: string; message: string };

export interface StartUpgradeDeps {
  business: { id: string; plan: BillingPlan };
  provider: BillingProvider;
  claimAttempt: (input: {
    businessId: string;
    kind: "initial";
    idempotencyKey: string;
  }) => Promise<BillingAttempt>;
  startAttempt: (attemptId: string, idempotencyKey: string) => Promise<BillingAttempt>;
  finishAttempt: (input: {
    attemptId: string;
    status: "failed" | "unknown";
    providerPreapprovalId?: string | null;
  }) => Promise<BillingAttempt>;
  // Rejects with `CURRENT_SUBSCRIPTION_CONFLICT` when the current subscription
  // is no longer the one read when the attempt was claimed.
  linkAttempt: (input: {
    attemptId: string;
    mpPreapprovalId: string;
  }) => Promise<void>;
  backUrl: string;
  payerEmail?: string;
  // Where Mercado Pago POSTs subscription webhook notifications (the tunnel /
  // deployed `/api/webhooks/mercadopago` URL). Required for subscriptions.
  notificationUrl?: string;
  idempotencyKey?: string;
  // When provided, guards against starting a second preapproval while one is
  // still pending (avoids orphaned preapprovals from double-clicking "upgrade").
  fetchSubscription?: FetchSubscription;
  // The negócio's checkout limits, checked before an attempt is reserved.
  checkoutLimits: CheckoutLimits;
  // A checkout created but never linked could not be cancelled; it needs a
  // manual cancel in Mercado Pago.
  reportOrphanCheckout: (input: { businessId: string; mpPreapprovalId: string }) => void | Promise<void>;
}

// Cancels a checkout whose link is never handed out because the link step
// refused it. The attempt already records it as failed with its preapproval,
// so a failed cancel loses nothing; it is reported for a manual cancel.
export async function cancelUnlinkedCheckout(
  input: { businessId: string; mpPreapprovalId: string },
  deps: Pick<StartUpgradeDeps, "provider" | "reportOrphanCheckout">,
): Promise<void> {
  try {
    await deps.provider.cancelPreapproval(input.mpPreapprovalId);
  } catch {
    await deps.reportOrphanCheckout(input);
  }
}

export async function startUpgrade(deps: StartUpgradeDeps): Promise<StartUpgradeResult> {
  const {
    business,
    provider,
    claimAttempt,
    startAttempt,
    finishAttempt,
    linkAttempt,
    backUrl,
    payerEmail,
    notificationUrl,
    fetchSubscription,
  } = deps;

  let existing: BillingSubscription | null = null;
  if (fetchSubscription) {
    existing = await fetchSubscription(business.id);
  }

  // Re-subscription during the grace window (US16): a business whose CURRENT
  // subscription is `cancelled`/`paused` is no longer being charged, so it may
  // start a fresh preapproval even while `businesses.plan` is still `pro`. Every
  // other Pro state (authorized, pending, or no row) may not start another.
  if (isProPlan(business.plan) && !isSubscriptionInGrace(existing?.status)) {
    return { ok: false, code: "ALREADY_PRO", message: "Sua conta já está no plano PROFISSIONAL." };
  }

  if (existing?.status === "pending") {
    return {
      ok: false,
      code: "UPGRADE_PENDING",
      message: "Você já iniciou uma assinatura. Conclua o pagamento para ativá-la.",
    };
  }

  const overLimits = await refuseCheckoutOverLimits(deps.checkoutLimits);
  if (overLimits) return overLimits;

  const idempotencyKey = deps.idempotencyKey ?? randomUUID();
  let attempt: BillingAttempt;
  try {
    attempt = await claimAttempt({ businessId: business.id, kind: "initial", idempotencyKey });
  } catch {
    return {
      ok: false,
      code: "ATTEMPT_ERROR",
      message: "Não foi possível iniciar a operação de pagamento. Tente novamente.",
    };
  }

  if (attempt.status === "unknown" || attempt.status === "ambiguous") {
    return {
      ok: false,
      code: "UPGRADE_RECONCILIATION_REQUIRED",
      message: "Existe uma tentativa de pagamento aguardando reconciliação.",
    };
  }

  if (attempt.idempotencyKey !== idempotencyKey || attempt.status !== "reserved") {
    return {
      ok: false,
      code: "UPGRADE_IN_PROGRESS",
      message: "Já existe uma tentativa de upgrade em andamento.",
    };
  }

  try {
    attempt = await startAttempt(attempt.id, idempotencyKey);
  } catch {
    return {
      ok: false,
      code: "ATTEMPT_ERROR",
      message: "Não foi possível iniciar a operação de pagamento. Tente novamente.",
    };
  }

  if (attempt.status !== "creating") {
    return {
      ok: false,
      code: "UPGRADE_IN_PROGRESS",
      message: "Já existe uma tentativa de upgrade em andamento.",
    };
  }

  let created;
  try {
    created = await provider.createPreapproval({
      plan: "pro",
      externalReference: attempt.id,
      payerEmail,
      backUrl,
      notificationUrl,
    });
  } catch (err) {
    const ambiguous = err instanceof MercadoPagoAmbiguousError;
    await finishAttempt({
      attemptId: attempt.id,
      status: ambiguous ? "unknown" : "failed",
    }).catch(() => undefined);
    return {
      ok: false,
      code: ambiguous ? "PROVIDER_UNKNOWN" : "PROVIDER_ERROR",
      message: "Não foi possível iniciar a assinatura. Tente novamente.",
    };
  }

  try {
    await linkAttempt({ attemptId: attempt.id, mpPreapprovalId: created.preapprovalId });
  } catch (err) {
    // The current subscription moved while the provider created the checkout
    // (e.g. the webhook made a paid superseded checkout current). Nothing was
    // linked, so the new checkout's link is never handed out.
    if (err instanceof Error && err.message === "CURRENT_SUBSCRIPTION_CONFLICT") {
      await finishAttempt({
        attemptId: attempt.id,
        status: "failed",
        providerPreapprovalId: created.preapprovalId,
      }).catch(() => undefined);
      await cancelUnlinkedCheckout(
        { businessId: business.id, mpPreapprovalId: created.preapprovalId },
        { provider, reportOrphanCheckout: deps.reportOrphanCheckout },
      );
      return {
        ok: false,
        code: "UPGRADE_SUBSCRIPTION_CONFLICT",
        message: "Sua assinatura mudou enquanto o pagamento era preparado. Atualize a página e confira seu plano.",
      };
    }
    await finishAttempt({
      attemptId: attempt.id,
      status: "unknown",
      providerPreapprovalId: created.preapprovalId,
    }).catch(() => undefined);
    return {
      ok: false,
      code: "SAVE_UNKNOWN",
      message: "A operação de pagamento precisa de verificação. Tente novamente mais tarde.",
    };
  }

  return { ok: true, initPoint: created.initPoint };
}

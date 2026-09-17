// The upgrade seam (ADR 0008). `startUpgrade` creates a Mercado Pago preapproval
// for the PROFISSIONAL plan (temporary R$ 1 test price, see SUBSCRIPTION_TERMS
// TODO in mercado-pago.ts) through the `BillingProvider` interface
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

  const idempotencyKey = deps.idempotencyKey ?? randomUUID();
  let attempt: BillingAttempt;
  try {
    attempt = await claimAttempt({ businessId: business.id, kind: "initial", idempotencyKey });
  } catch (err) {
    return {
      ok: false,
      code: "ATTEMPT_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível iniciar a tentativa de upgrade.",
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
  } catch (err) {
    return {
      ok: false,
      code: "ATTEMPT_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível reservar a tentativa de upgrade.",
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
      message: err instanceof Error ? err.message : "Não foi possível iniciar a assinatura.",
    };
  }

  try {
    await linkAttempt({ attemptId: attempt.id, mpPreapprovalId: created.preapprovalId });
  } catch (err) {
    await finishAttempt({
      attemptId: attempt.id,
      status: "unknown",
      providerPreapprovalId: created.preapprovalId,
    }).catch(() => undefined);
    return {
      ok: false,
      code: "SAVE_UNKNOWN",
      message: err instanceof Error ? err.message : "Não foi possível salvar a assinatura.",
    };
  }

  return { ok: true, initPoint: created.initPoint };
}

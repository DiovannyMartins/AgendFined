// Retry flow backed by billing_attempts. The old pending subscription is
// never overwritten: a retry creates a new subscription row and switches the
// current pointer only after the provider object is durably linked.
import { randomUUID } from "node:crypto";
import type { BillingProvider } from "./provider";
import { MercadoPagoAmbiguousError } from "./mercado-pago";
import type { BillingAttempt } from "./start-upgrade";
import type { FetchSubscription } from "./get-subscription";

export type RetryUpgradeResult = { ok: true; initPoint: string } | { ok: false; code: string; message: string };

export interface RetryUpgradeDeps {
  business: { id: string };
  provider: BillingProvider;
  fetchSubscription: FetchSubscription;
  claimAttempt: (input: {
    businessId: string;
    kind: "retry";
    expectedSubscriptionId: string;
    idempotencyKey: string;
  }) => Promise<BillingAttempt>;
  startRetry: (input: {
    attemptId: string;
    idempotencyKey: string;
    expectedSubscriptionId: string;
    expectedMpPreapprovalId: string;
  }) => Promise<BillingAttempt>;
  finishAttempt: (input: {
    attemptId: string;
    status: "failed" | "unknown";
    providerPreapprovalId?: string | null;
  }) => Promise<BillingAttempt>;
  linkAttempt: (input: { attemptId: string; mpPreapprovalId: string }) => Promise<void>;
  backUrl: string;
  payerEmail?: string;
  notificationUrl?: string;
  idempotencyKey?: string;
}

export async function retryPendingUpgrade(deps: RetryUpgradeDeps): Promise<RetryUpgradeResult> {
  const existing = await deps.fetchSubscription(deps.business.id);
  if (!existing || existing.status !== "pending") {
    return { ok: false, code: "NO_PENDING_SUBSCRIPTION", message: "Você não tem um pagamento pendente para concluir." };
  }
  if (!existing.subscriptionId) {
    return { ok: false, code: "SUBSCRIPTION_ID_UNAVAILABLE", message: "Não foi possível identificar a assinatura pendente." };
  }

  const idempotencyKey = deps.idempotencyKey ?? randomUUID();
  let attempt: BillingAttempt;
  try {
    attempt = await deps.claimAttempt({
      businessId: deps.business.id,
      kind: "retry",
      expectedSubscriptionId: existing.subscriptionId,
      idempotencyKey,
    });
  } catch (err) {
    return { ok: false, code: "ATTEMPT_ERROR", message: err instanceof Error ? err.message : "Não foi possível iniciar o retry." };
  }

  if (attempt.kind !== "retry" || attempt.idempotencyKey !== idempotencyKey) {
    return { ok: false, code: "UPGRADE_IN_PROGRESS", message: "Já existe uma operação de billing em andamento." };
  }
  if (attempt.status === "unknown" || attempt.status === "ambiguous") {
    return { ok: false, code: "UPGRADE_RECONCILIATION_REQUIRED", message: "Existe uma tentativa aguardando reconciliação." };
  }
  if (attempt.status !== "reserved") {
    return { ok: false, code: "UPGRADE_IN_PROGRESS", message: "O retry já está em andamento." };
  }

  try {
    attempt = await deps.startRetry({
      attemptId: attempt.id,
      idempotencyKey,
      expectedSubscriptionId: existing.subscriptionId,
      expectedMpPreapprovalId: existing.mpPreapprovalId,
    });
  } catch (err) {
    // The reservation is only useful while the expected pending subscription
    // still exists. If the CAS rejects it, release the reservation so a stale
    // retry cannot strand the business in "billing in progress" forever.
    await deps.finishAttempt({ attemptId: attempt.id, status: "failed" }).catch(() => undefined);
    return { ok: false, code: "RETRY_SUBSCRIPTION_CONFLICT", message: err instanceof Error ? err.message : "A assinatura pendente foi alterada." };
  }
  if (attempt.status !== "creating") {
    return { ok: false, code: "UPGRADE_IN_PROGRESS", message: "O retry já está em andamento." };
  }

  let created;
  try {
    created = await deps.provider.createPreapproval({
      plan: "pro",
      externalReference: attempt.id,
      payerEmail: deps.payerEmail,
      backUrl: deps.backUrl,
      notificationUrl: deps.notificationUrl,
    });
  } catch (err) {
    const ambiguous = err instanceof MercadoPagoAmbiguousError;
    await deps.finishAttempt({ attemptId: attempt.id, status: ambiguous ? "unknown" : "failed" }).catch(() => undefined);
    return {
      ok: false,
      code: ambiguous ? "PROVIDER_UNKNOWN" : "PROVIDER_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível gerar um novo link de pagamento.",
    };
  }

  try {
    await deps.linkAttempt({ attemptId: attempt.id, mpPreapprovalId: created.preapprovalId });
  } catch (err) {
    await deps.finishAttempt({
      attemptId: attempt.id,
      status: "unknown",
      providerPreapprovalId: created.preapprovalId,
    }).catch(() => undefined);
    return { ok: false, code: "SAVE_UNKNOWN", message: err instanceof Error ? err.message : "Não foi possível salvar a nova assinatura." };
  }

  // Cancellation happens only after the replacement is locally linked. A
  // failure here is observable and does not trigger another provider create.
  try {
    await deps.provider.cancelPreapproval(existing.mpPreapprovalId);
  } catch (err) {
    return { ok: false, code: "OLD_SUBSCRIPTION_CANCEL_ERROR", message: err instanceof Error ? err.message : "A nova assinatura foi vinculada, mas a anterior não foi cancelada." };
  }

  return { ok: true, initPoint: created.initPoint };
}

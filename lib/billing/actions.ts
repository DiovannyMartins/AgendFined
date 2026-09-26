"use server";

import type { Database } from "@/lib/supabase/database-types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createMercadoPagoProvider } from "./mercado-pago";
import { fetchCurrentSubscription } from "./get-subscription";
import { syncReturnedSubscription } from "./return-sync";
import { createWebhookPersistence } from "./webhook-server";
import { revalidatePath } from "next/cache";
import {
  startUpgrade as buildStartUpgrade,
  type StartUpgradeResult,
} from "./start-upgrade";
import {
  cancelSubscription as buildCancelSubscription,
  type CancelSubscriptionResult,
} from "./cancel-subscription";
import {
  retryPendingUpgrade as buildRetryPendingUpgrade,
  type RetryUpgradeResult,
} from "./retry-upgrade";

// Server action called by the "Fazer upgrade" button. Returns the Mercado Pago
// `init_point` so the client can redirect the payer to the checkout (sandbox in
// dev). Reads `MERCADO_PAGO_ACCESS_TOKEN`; when unset it fails closed with a
// friendly message rather than attempting a real call.
export async function startUpgrade(): Promise<StartUpgradeResult> {
  const business = await getCurrentBusiness();
  if (!business) {
    return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio antes de assinar." };
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "O pagamento ainda não está configurado neste ambiente.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const provider = createMercadoPagoProvider({ accessToken });
  const backUrl = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/billing/return`;
  const notificationUrl = process.env.MERCADO_PAGO_NOTIFICATION_URL;

  return buildStartUpgrade({
    business: { id: business.id, plan: business.plan },
    provider,
    claimAttempt: async (input) => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("claim_billing_attempt", {
        p_business_id: input.businessId,
        p_kind: input.kind,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return {
        id: data.id,
        businessId: data.business_id,
        kind: data.kind,
        status: data.status,
        idempotencyKey: data.idempotency_key,
        providerPreapprovalId: data.provider_preapproval_id,
      };
    },
    startAttempt: async (attemptId, idempotencyKey) => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("start_billing_attempt", {
        p_attempt_id: attemptId,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return {
        id: data.id,
        businessId: data.business_id,
        kind: data.kind,
        status: data.status,
        idempotencyKey: data.idempotency_key,
        providerPreapprovalId: data.provider_preapproval_id,
      };
    },
    finishAttempt: async (input) => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("finish_billing_attempt", {
        p_attempt_id: input.attemptId,
        p_status: input.status,
        p_provider_preapproval_id: input.providerPreapprovalId ?? null,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return {
        id: data.id,
        businessId: data.business_id,
        kind: data.kind,
        status: data.status,
        idempotencyKey: data.idempotency_key,
        providerPreapprovalId: data.provider_preapproval_id,
      };
    },
    linkAttempt: async ({ attemptId, mpPreapprovalId }) => {
      const admin = createAdminClient();
      const { error } = await admin.rpc("link_billing_attempt_subscription", {
        p_attempt_id: attemptId,
        p_mp_preapproval_id: mpPreapprovalId,
        p_status: "pending",
      });
      if (error) throw new Error(error.message);
    },
    fetchSubscription: fetchCurrentSubscription,
    backUrl,
    payerEmail: user?.email,
    notificationUrl,
  });
}

// Server action called by the "Concluir pagamento" button. The checkout
// `init_point` is only returned once by `startUpgrade`, so an abandoned
// checkout (closed tab, unpaid) leaves a `pending` row with no way to pay.
// This generates a FRESH preapproval and repoints the pending row at it, then
// returns the new `init_point` for the client to redirect to. Reads
// `MERCADO_PAGO_ACCESS_TOKEN`; when unset it fails closed.
export async function retryUpgrade(): Promise<RetryUpgradeResult> {
  const business = await getCurrentBusiness();
  if (!business) {
    return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio antes de assinar." };
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "O pagamento ainda não está configurado neste ambiente.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const provider = createMercadoPagoProvider({ accessToken });
  const admin = createAdminClient();
  const backUrl = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/billing/return`;
  const notificationUrl = process.env.MERCADO_PAGO_NOTIFICATION_URL;

  return buildRetryPendingUpgrade({
    business: { id: business.id },
    provider,
    fetchSubscription: fetchCurrentSubscription,
    claimAttempt: async (input) => {
      const { data, error } = await admin.rpc("claim_billing_attempt", {
        p_business_id: input.businessId,
        p_kind: input.kind,
        p_expected_subscription_id: input.expectedSubscriptionId,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return { id: data.id, businessId: data.business_id, kind: data.kind, status: data.status, idempotencyKey: data.idempotency_key, providerPreapprovalId: data.provider_preapproval_id };
    },
    startRetry: async (input) => {
      const { data, error } = await admin.rpc("start_billing_retry", {
        p_attempt_id: input.attemptId,
        p_idempotency_key: input.idempotencyKey,
        p_expected_subscription_id: input.expectedSubscriptionId,
        p_expected_mp_preapproval_id: input.expectedMpPreapprovalId,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return { id: data.id, businessId: data.business_id, kind: data.kind, status: data.status, idempotencyKey: data.idempotency_key, providerPreapprovalId: data.provider_preapproval_id };
    },
    finishAttempt: async (input) => {
      const { data, error } = await admin.rpc("finish_billing_attempt", {
        p_attempt_id: input.attemptId,
        p_status: input.status,
        p_provider_preapproval_id: input.providerPreapprovalId ?? null,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return { id: data.id, businessId: data.business_id, kind: data.kind, status: data.status, idempotencyKey: data.idempotency_key, providerPreapprovalId: data.provider_preapproval_id };
    },
    linkAttempt: async (input) => {
      const { error } = await admin.rpc("link_billing_attempt_subscription", {
        p_attempt_id: input.attemptId,
        p_mp_preapproval_id: input.mpPreapprovalId,
        p_status: "pending",
      });
      if (error) throw new Error(error.message);
    },
    backUrl,
    payerEmail: user?.email,
    notificationUrl,
  });
}

// Mercado Pago redirects here after checkout. The webhook remains the normal
// lifecycle path; this authenticated read-after-write closes the return race
// so the dashboard can show PROFISSIONAL immediately after an authorized
// checkout without ever trusting a browser-supplied success flag.
export async function syncCurrentSubscriptionAfterReturn(): Promise<void> {
  const business = await getCurrentBusiness();
  if (!business || !process.env.MERCADO_PAGO_ACCESS_TOKEN) return;

  const provider = createMercadoPagoProvider({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
  const persistence = createWebhookPersistence();
  await syncReturnedSubscription(business.id, {
    fetchSubscription: fetchCurrentSubscription,
    getPreapproval: provider.getPreapproval,
    applySnapshot: persistence.applySnapshot,
  });
  revalidatePath("/dashboard/configuracoes");
}

// Server action called by the "Cancelar assinatura" button. Cancels the active
// Mercado Pago preapproval (so the owner stops being charged) and records the
// `cancelled` status with a grace period; the downgrade cron drops the business
// to Free once the grace passes. Reads `MERCADO_PAGO_ACCESS_TOKEN`; when unset it
// fails closed.
export async function cancelSubscription(): Promise<CancelSubscriptionResult> {
  const business = await getCurrentBusiness();
  if (!business) {
    return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio antes de gerenciar a assinatura." };
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "O pagamento ainda não está configurado neste ambiente.",
    };
  }

  const provider = createMercadoPagoProvider({ accessToken });
  const admin = createAdminClient();

  return buildCancelSubscription({
    business: { id: business.id, plan: business.plan },
    provider,
    fetchSubscription: fetchCurrentSubscription,
    updateSubscription: async (mpPreapprovalId, update) => {
      const payload: Database["public"]["Tables"]["subscriptions"]["Update"] = {};
      if (update.status !== undefined) payload.status = update.status;
      if (update.gracePeriodEnd !== undefined) payload.grace_period_end = update.gracePeriodEnd;
      const { error } = await admin
        .from("subscriptions")
        .update(payload)
        .eq("mp_preapproval_id", mpPreapprovalId);
      if (error) throw new Error(error.message);
    },
  });
}

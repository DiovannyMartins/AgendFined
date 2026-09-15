"use server";

import type { Database } from "@/lib/supabase/database-types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createMercadoPagoProvider } from "./mercado-pago";
import { fetchCurrentSubscription } from "./get-subscription";
import {
  startUpgrade as buildStartUpgrade,
  type SaveSubscription,
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

// Writes the new subscription row. The owner RLS policy only allows SELECT on
// `subscriptions`, so the server action uses the service-role client (which
// bypasses RLS) to persist the preapproval the webhook (issue #24) will later
// authorize.
const saveSubscriptionViaAdmin: SaveSubscription = async (input) => {
  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").insert({
    business_id: input.businessId,
    mp_preapproval_id: input.mpPreapprovalId,
    plan: input.plan,
    status: input.status,
  });
  if (error) throw new Error(error.message);
};

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
  const backUrl = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/dashboard/configuracoes`;
  const notificationUrl = process.env.MERCADO_PAGO_NOTIFICATION_URL;

  return buildStartUpgrade({
    business: { id: business.id, plan: business.plan },
    provider,
    saveSubscription: saveSubscriptionViaAdmin,
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
  const backUrl = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/dashboard/configuracoes`;
  const notificationUrl = process.env.MERCADO_PAGO_NOTIFICATION_URL;

  return buildRetryPendingUpgrade({
    business: { id: business.id },
    provider,
    fetchSubscription: fetchCurrentSubscription,
    replaceSubscription: async (oldMpPreapprovalId, input) => {
      const { error } = await admin
        .from("subscriptions")
        .update({ mp_preapproval_id: input.mpPreapprovalId })
        .eq("business_id", business.id)
        .eq("mp_preapproval_id", oldMpPreapprovalId);
      if (error) throw new Error(error.message);
    },
    backUrl,
    payerEmail: user?.email,
    notificationUrl,
  });
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

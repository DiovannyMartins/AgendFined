// Server-side wiring for the Mercado Pago webhook (issue #24). `handleWebhook`
// is the pure decision core; this module binds its injected persistence (the
// `subscriptions` + `businesses` writes) to the service-role client and its
// `getPreapproval` to the Mercado Pago provider, so the route handler stays thin
// and the integration tests can drive the same persistence with a stubbed
// `getPreapproval`. All writes bypass RLS via the service role — the webhook has
// no owner session, and the plan trigger (`protect_business_plan`) permits the
// service context (no `auth.uid()`).
import type { Database } from "@/lib/supabase/database-types";
import type { SubscriptionStatus } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMercadoPagoProvider } from "./mercado-pago";
import { handleWebhook, type HandleWebhookResult, type WebhookEvent } from "./handle-webhook";

export function createWebhookPersistence() {
  const admin = createAdminClient();
  return {
    findSubscription: async (mpPreapprovalId: string) => {
      const { data, error } = await admin
        .from("subscriptions")
        .select("*")
        .eq("mp_preapproval_id", mpPreapprovalId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id,
        businessId: data.business_id,
        mpPreapprovalId: data.mp_preapproval_id,
        status: data.status,
        plan: data.plan,
        gracePeriodEnd: data.grace_period_end,
      };
    },
    setPlan: async (businessId: string, plan: "free" | "pro") => {
      const { error } = await admin.from("businesses").update({ plan }).eq("id", businessId);
      if (error) throw new Error(error.message);
    },
    updateSubscription: async (
      mpPreapprovalId: string,
      update: {
        status?: SubscriptionStatus;
        plan?: "free" | "pro";
        gracePeriodEnd?: string | null;
        currentPeriodStart?: string | null;
        currentPeriodEnd?: string | null;
      },
    ) => {
      const payload: Database["public"]["Tables"]["subscriptions"]["Update"] = {};
      if (update.status !== undefined) payload.status = update.status;
      if (update.plan !== undefined) payload.plan = update.plan;
      if (update.gracePeriodEnd !== undefined) payload.grace_period_end = update.gracePeriodEnd;
      if (update.currentPeriodStart !== undefined) payload.current_period_start = update.currentPeriodStart;
      if (update.currentPeriodEnd !== undefined) payload.current_period_end = update.currentPeriodEnd;
      const { error } = await admin.from("subscriptions").update(payload).eq("mp_preapproval_id", mpPreapprovalId);
      if (error) throw new Error(error.message);
    },
  };
}

export interface MercadoPagoWebhookServerConfig {
  accessToken: string;
  graceDays?: number;
}

export async function runMercadoPagoWebhook(
  event: WebhookEvent,
  config: MercadoPagoWebhookServerConfig,
): Promise<HandleWebhookResult> {
  const provider = createMercadoPagoProvider({ accessToken: config.accessToken });
  return handleWebhook({
    event,
    getPreapproval: (dataId) => provider.getPreapproval(dataId),
    ...createWebhookPersistence(),
    graceDays: config.graceDays,
  });
}

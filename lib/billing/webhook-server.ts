// Server-side wiring for the Mercado Pago webhook (issue #24). `handleWebhook`
// is the pure decision core; this module binds its injected persistence (the
// `subscriptions` + `businesses` writes) to the service-role client and its
// `getPreapproval` to the Mercado Pago provider, so the route handler stays thin
// and the integration tests can drive the same persistence with a stubbed
// `getPreapproval`. All writes bypass RLS via the service role — the webhook has
// no owner session, and the plan trigger (`protect_business_plan`) permits the
// service context (no `auth.uid()`).
import { createAdminClient } from "@/lib/supabase/admin";
import { createMercadoPagoProvider } from "./mercado-pago";
import {
  handleWebhook,
  type AppliedSubscriptionSnapshot,
  type ApplySubscriptionSnapshotInput,
  type HandleWebhookResult,
  type WebhookEvent,
} from "./handle-webhook";

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
        gracePeriodEnd: data.grace_period_end,
      };
    },
    applySnapshot: async (input: ApplySubscriptionSnapshotInput): Promise<AppliedSubscriptionSnapshot> => {
      const { data, error } = await admin.rpc("apply_subscription_snapshot", {
        p_business_id: input.businessId,
        p_subscription_id: input.subscriptionId,
        p_mp_preapproval_id: input.mpPreapprovalId,
        p_status: input.status,
        p_current_period_start: input.currentPeriodStart,
        p_current_period_end: input.currentPeriodEnd,
        p_grace_period_end: input.gracePeriodEnd,
        p_make_current: false,
        p_expected_current_subscription_id: null,
      });
      if (error) throw new Error(error.message);
      const row = data?.[0];
      if (!row) throw new Error("SUBSCRIPTION_SNAPSHOT_NOT_APPLIED");
      return {
        subscriptionId: row.subscription_id,
        businessId: row.business_id,
        subscriptionStatus: row.subscription_status,
        isCurrent: row.is_current,
        effectivePlan: row.effective_plan,
        effectiveGracePeriodEnd: row.effective_grace_period_end,
      };
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

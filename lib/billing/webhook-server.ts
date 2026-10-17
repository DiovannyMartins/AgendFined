// Server-side wiring for the Mercado Pago webhook (issue #24). `handleWebhook`
// is the pure decision core; this module binds its injected persistence (the
// `subscriptions` + `businesses` writes) to the service-role client and its
// `getPreapproval` to the Mercado Pago provider, so the route handler stays thin
// and the integration tests can drive the same persistence with a stubbed
// `getPreapproval`. All writes bypass RLS via the service role — the webhook has
// no owner session, and the plan trigger (`protect_business_plan`) permits the
// service context (no `auth.uid()`).
import type { Database } from "@/lib/supabase/database-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProPriceCents } from "@/lib/plan/catalog";
import { createMercadoPagoProvider } from "./mercado-pago";
import {
  handleWebhook,
  type AppliedSubscriptionSnapshot,
  type ApplySubscriptionSnapshotInput,
  type HandleWebhookResult,
  type SubscriptionForWebhook,
  type WebhookEvent,
} from "./handle-webhook";

function mapSubscription(row: Database["public"]["Tables"]["subscriptions"]["Row"]): SubscriptionForWebhook {
  return {
    id: row.id,
    businessId: row.business_id,
    mpPreapprovalId: row.mp_preapproval_id,
    status: row.status,
    gracePeriodEnd: row.grace_period_end,
  };
}

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
      return data ? mapSubscription(data) : null;
    },
    findCurrentSubscription: async (businessId: string) => {
      const { data: business, error: businessError } = await admin
        .from("businesses")
        .select("current_subscription_id")
        .eq("id", businessId)
        .single();
      if (businessError) throw new Error(businessError.message);
      if (!business.current_subscription_id) return null;
      const { data, error } = await admin
        .from("subscriptions")
        .select("*")
        .eq("business_id", businessId)
        .eq("id", business.current_subscription_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapSubscription(data) : null;
    },
    listOtherPendingSubscriptions: async (businessId: string, exceptSubscriptionId: string) => {
      const { data, error } = await admin
        .from("subscriptions")
        .select("*")
        .eq("business_id", businessId)
        .eq("status", "pending")
        .neq("id", exceptSubscriptionId);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapSubscription);
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
        p_make_current: input.makeCurrent !== undefined,
        p_expected_current_subscription_id: input.makeCurrent?.expectedCurrentSubscriptionId ?? null,
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

// The refusal of a first authorization whose terms the plan does not sell, shared
// by the webhook, the checkout return and the reconciliation. Surfaces in the
// Vercel logs next to the reconciliation reports; the charge already taken has
// to be refunded by hand in Mercado Pago.
export function createCheckoutTermsReporting() {
  return {
    currentPriceCents: getProPriceCents(),
    reportStalePriceCharge: (input: { businessId: string; mpPreapprovalId: string }) =>
      console.error(JSON.stringify({ event: "billing_stale_price_charge", ...input })),
    reportUnexpectedTermsCharge: (input: { businessId: string; mpPreapprovalId: string }) =>
      console.error(JSON.stringify({ event: "billing_unexpected_terms_charge", ...input })),
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
    cancelPreapproval: (mpPreapprovalId) => provider.cancelPreapproval(mpPreapprovalId),
    // Surfaces in the Vercel logs next to the reconciliation reports; the
    // charge already taken has to be refunded by hand in Mercado Pago.
    reportDoubleCharge: (input) =>
      console.error(JSON.stringify({ event: "billing_double_charge", ...input })),
    ...createCheckoutTermsReporting(),
    graceDays: config.graceDays,
  });
}

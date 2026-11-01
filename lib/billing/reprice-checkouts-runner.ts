// Server-side wiring for the pending checkout repricing, run by the
// reconciliation cron (`/api/internal/reconciliation`, every 30 minutes). Each
// run takes the pending subscriptions checked longest ago, so abandoned
// checkouts already at the current price do not hold the batch forever.
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanPriceCents } from "@/lib/plan/catalog";
import { createMercadoPagoProvider } from "./mercado-pago";
import type { BillingProvider } from "./provider";
import { repricePendingCheckouts, type RepriceCheckoutsResult } from "./reprice-checkouts";

// Each checkout costs up to four Mercado Pago calls; the cron's HTTP timeout is
// 60 seconds and reconciliation runs first.
const DEFAULT_BATCH = 20;

export interface PendingCheckoutRepricingOptions {
  provider?: Pick<BillingProvider, "getPreapproval" | "updatePreapprovalAmount" | "cancelPreapproval">;
  currentPriceCents?: number;
  limit?: number;
}

export async function runPendingCheckoutRepricing(
  options: PendingCheckoutRepricingOptions = {},
): Promise<RepriceCheckoutsResult> {
  const admin = createAdminClient();
  const provider =
    options.provider ?? createMercadoPagoProvider({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "" });

  const { data, error } = await admin
    .from("subscriptions")
    .select("mp_preapproval_id, business_id")
    .eq("status", "pending")
    .order("updated_at", { ascending: true })
    .limit(options.limit ?? DEFAULT_BATCH);
  if (error) throw new Error("REPRICING_CHECKOUTS_LOAD_FAILED");
  const ids = (data ?? []).map((row) => row.mp_preapproval_id);
  const businessIds = new Map((data ?? []).map((row) => [row.mp_preapproval_id, row.business_id]));

  const result = await repricePendingCheckouts({
    listPendingCheckouts: async () => ids,
    getPreapproval: (id) => provider.getPreapproval(id),
    updatePreapprovalAmount: (id, amountCents) => provider.updatePreapprovalAmount(id, amountCents),
    cancelPreapproval: (id) => provider.cancelPreapproval(id),
    // Same event as the webhook's terms gate, so one alert covers both refunds.
    reportRacedCharge: ({ mpPreapprovalId }) =>
      console.error(
        JSON.stringify({
          event: "billing_stale_price_charge",
          businessId: businessIds.get(mpPreapprovalId),
          mpPreapprovalId,
          source: "checkout_repricing",
        }),
      ),
    currentPriceCents: options.currentPriceCents ?? getPlanPriceCents(),
    // The reason is the Mercado Pago status and message, never the token.
    reportFailure: (input) => console.error(JSON.stringify({ event: "checkout_repricing_item_failed", ...input })),
  });

  // Rewriting the unchanged status fires `set_updated_at`, sending these rows
  // to the back of the next batch. Rows a webhook moved meanwhile are skipped.
  if (ids.length > 0) {
    const { error: touchError } = await admin
      .from("subscriptions")
      .update({ status: "pending" })
      .in("mp_preapproval_id", ids)
      .eq("status", "pending");
    if (touchError) throw new Error("REPRICING_CHECKOUTS_ROTATE_FAILED");
  }
  return result;
}

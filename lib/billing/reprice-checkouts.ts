// A checkout keeps the price it was created with. After a price change, an
// unpaid checkout would still sell PROFISSIONAL at the old price, so this
// routine (run by the reconciliation cron) brings every pending checkout up to
// the current price at Mercado Pago. Dependencies are injected so it is
// unit-testable without the provider or a database.
import type { Preapproval } from "./provider";
import { MercadoPagoAmbiguousError } from "./mercado-pago";

export interface RepriceCheckoutsDeps {
  // `mp_preapproval_id` of the local `pending` subscriptions.
  listPendingCheckouts: () => Promise<string[]>;
  getPreapproval: (id: string) => Promise<Preapproval>;
  updatePreapprovalAmount: (id: string, amountCents: number) => Promise<void>;
  cancelPreapproval: (id: string) => Promise<void>;
  currentPriceCents: number;
  // A failed checkout is retried by the next run, so without this the reason
  // never surfaces anywhere.
  reportFailure?: (input: { mpPreapprovalId: string; reason: string }) => void;
}

export interface RepriceCheckoutsResult {
  checked: number;
  repriced: number;
  cancelled: number;
  failed: number;
}

export async function repricePendingCheckouts(deps: RepriceCheckoutsDeps): Promise<RepriceCheckoutsResult> {
  const result: RepriceCheckoutsResult = { checked: 0, repriced: 0, cancelled: 0, failed: 0 };
  for (const id of await deps.listPendingCheckouts()) {
    result.checked += 1;
    try {
      const outcome = await repriceCheckout(id, deps);
      if (outcome) result[outcome] += 1;
    } catch (error) {
      // Left for the next run; the webhook still refuses a stale-price payment.
      result.failed += 1;
      deps.reportFailure?.({ mpPreapprovalId: id, reason: error instanceof Error ? error.message : "unknown" });
    }
  }
  return result;
}

async function repriceCheckout(id: string, deps: RepriceCheckoutsDeps): Promise<"repriced" | "cancelled" | null> {
  const checkout = await deps.getPreapproval(id);
  // A checkout paid or closed at the provider is the webhook's to handle. An
  // unknown amount is repriced too: setting the current price is harmless.
  if (checkout.status !== "pending") return null;
  if (checkout.transactionAmount !== null && Math.round(checkout.transactionAmount * 100) === deps.currentPriceCents) {
    return null;
  }
  try {
    await deps.updatePreapprovalAmount(id, deps.currentPriceCents);
    return "repriced";
  } catch (error) {
    // An answer that never arrived is not a refusal: Mercado Pago may have
    // applied the new price. Left for the next run.
    if (error instanceof MercadoPagoAmbiguousError) throw error;
    // Refused: cancel instead, so the link cannot be paid at the old price.
    // The payer gets Mercado Pago's cancellation e-mail and can subscribe again.
    await deps.cancelPreapproval(id);
    return "cancelled";
  }
}

// The billing provider seam (ADR 0008). This interface is the contract that
// abstracts the payment provider; `lib/billing/mercado-pago.ts` is the concrete
// Mercado Pago implementation behind it. The rest of the billing module and the
// plan gate depend only on this interface, never on Mercado Pago, so swapping
// providers (or stubbing in tests) requires no change to callers.
import type { BillingPlan } from "./types";

export interface CreatePreapprovalInput {
  // The plan being subscribed to; the provider derives the price and the
  // subscription terms from it. Only the pro plan is currently offered.
  plan: BillingPlan;
  // A caller-owned identifier carried through to the provider (business id).
  externalReference: string;
  payerEmail?: string;
  // Where Mercado Pago sends the payer back after the flow (dashboard).
  backUrl: string;
  // Where Mercado Pago should deliver subscription (preapproval) webhook
  // notifications, ending in `/api/webhooks/mercadopago`. A hint only: Mercado
  // Pago does NOT persist a per-preapproval `notification_url` for
  // subscriptions, so the URL must ALSO be configured in "Your integrations"
  // (topic `subscription_preapproval`). Keep this in sync with that panel URL.
  notificationUrl?: string;
}

export interface CreatePreapprovalResult {
  preapprovalId: string;
  initPoint: string;
}

// The current state of a Mercado Pago preapproval (subscription), as returned by
// `GET /preapproval/{id}`. The webhook lifecycle (issue #24) reads this to map
// the provider's status onto the plan state. `externalReference` is the caller's
// `external_reference`, i.e. the business id.
export interface Preapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  externalReference: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface BillingProvider {
  // Creates a recurring preapproval (subscription) for the paid plan and returns
  // the checkout link (`init_point`) the user is redirected to.
  createPreapproval(input: CreatePreapprovalInput): Promise<CreatePreapprovalResult>;
  // Fetches a preapproval by id so the webhook handler can read its current
  // status and map it onto the plan lifecycle.
  getPreapproval(id: string, options?: { timeoutMs?: number }): Promise<Preapproval>;
  // Cancels a preapproval so the provider stops charging (user-initiated cancel).
  // Idempotent: cancelling an already-cancelled preapproval succeeds.
  cancelPreapproval(id: string): Promise<void>;
}

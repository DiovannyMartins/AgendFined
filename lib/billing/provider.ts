// The billing provider seam (ADR 0008). This interface is the contract that
// abstracts the payment provider; `lib/billing/mercado-pago.ts` is the concrete
// Mercado Pago implementation behind it. The rest of the billing module and the
// plan gate depend only on this interface, never on Mercado Pago, so swapping
// providers (or stubbing in tests) requires no change to callers.
// The provider sells the Plano AgendFined, the only plan (ADR 0013), at the
// configured price.
export interface CreatePreapprovalInput {
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
  // When the first charge happens (ISO instant, `firstChargeDate`): the end of
  // the teste grátis. Null or absent charges now.
  startDate?: string | null;
}

export interface CreatePreapprovalResult {
  preapprovalId: string;
  initPoint: string;
}

// The current state of a Mercado Pago preapproval (subscription), as returned by
// `GET /preapproval/{id}`. The webhook lifecycle (issue #24) reads this to map
// the provider's status onto the assinatura state. `externalReference` is the caller's
// `external_reference`, i.e. the business id.
export interface Preapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  externalReference: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  // The recurring charge in reais (`auto_recurring.transaction_amount`), fixed
  // when the checkout was created; null when the provider omits it.
  transactionAmount: number | null;
  // The rest of the recurring terms (`auto_recurring`); null when omitted.
  currencyId: string | null;
  frequency: number | null;
  frequencyType: string | null;
  // When the provider last changed the preapproval (`last_modified`): the
  // version of this snapshot. Null or absent when the provider omits it.
  lastModified?: string | null;
}

export interface BillingProvider {
  // Creates a recurring preapproval (subscription) for the paid plan and returns
  // the checkout link (`init_point`) the user is redirected to.
  createPreapproval(input: CreatePreapprovalInput): Promise<CreatePreapprovalResult>;
  // Fetches a preapproval by id so the webhook handler can read its current
  // status and map it onto the assinatura lifecycle.
  getPreapproval(id: string, options?: { timeoutMs?: number }): Promise<Preapproval>;
  // Changes the recurring charge of a preapproval, e.g. to bring a checkout
  // created before a price change up to the current price.
  updatePreapprovalAmount(id: string, amountCents: number): Promise<void>;
  // Cancels a preapproval so the provider stops charging (user-initiated cancel).
  // Idempotent: cancelling an already-cancelled preapproval succeeds.
  cancelPreapproval(id: string): Promise<void>;
}

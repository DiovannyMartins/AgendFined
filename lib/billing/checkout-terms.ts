// The terms a first authorization must carry to give a negócio access.
// A checkout keeps the terms it was created with, so one created before a price
// change, or with terms the plan does not sell, can still be paid. The webhook,
// the checkout return and the reconciliation all apply a first authorization,
// so all of them refuse it here the same way: reported for a manual refund and
// cancelled, never activated.
import type { SubscriptionStatus } from "./types";

export type CheckoutTermsRefusal = "stale_price" | "unexpected_terms";

export interface CheckoutTerms {
  status: SubscriptionStatus;
  transactionAmount: number | null;
  currencyId: string | null;
  frequency: number | null;
  frequencyType: string | null;
}

export interface CheckoutTermsDeps {
  // The Plano AgendFined price now (`getProPriceCents`).
  currentPriceCents: number;
  reportStalePriceCharge: (input: { businessId: string; mpPreapprovalId: string }) => void | Promise<void>;
  reportUnexpectedTermsCharge: (input: { businessId: string; mpPreapprovalId: string }) => void | Promise<void>;
  cancelPreapproval: (mpPreapprovalId: string) => Promise<void>;
}

// Whether a checkout's recurring terms differ from what the Plano AgendFined
// sells: a charge below the current price (created before a price change), or
// a currency or frequency other than BRL monthly. A term the provider omits is
// not held against the checkout.
export function refuseCheckoutTerms(terms: CheckoutTerms, currentPriceCents: number): CheckoutTermsRefusal | null {
  if (terms.transactionAmount !== null && Math.round(terms.transactionAmount * 100) < currentPriceCents) {
    return "stale_price";
  }
  if (
    (terms.currencyId !== null && terms.currencyId !== "BRL") ||
    (terms.frequency !== null && terms.frequency !== 1) ||
    (terms.frequencyType !== null && terms.frequencyType !== "months")
  ) {
    return "unexpected_terms";
  }
  return null;
}

// The local row of the checkout, as the gate needs it. `firstAuthorizedAt` is
// set by the database on the row's first `authorized` write and never cleared.
export interface CheckoutLocalState {
  status: SubscriptionStatus;
  firstAuthorizedAt?: string | null;
}

// Whether the local row was ever authorized. The status alone does not say: a
// checkout closed `paused`/`cancelled` before it was paid, or inserted
// `paused` by the reconciliation, never gave the negócio access.
export function wasEverAuthorized(local: CheckoutLocalState | null): boolean {
  if (!local) return false;
  return local.status === "authorized" || Boolean(local.firstAuthorizedAt);
}

// Refuses the first authorization of a checkout whose terms are not the plan's.
// The start_date of a checkout created during the teste grátis is not a term:
// only the amount, the currency and the frequency are compared.
// Only a checkout never authorized locally (not linked yet, `pending`, or closed
// before it was paid) is checked: an assinatura already authorized at an older
// price keeps renewing at that price. The charge is reported before the cancel,
// so a refund is never lost to a failed cancel; a failed cancel throws, and the
// caller must not apply the authorization.
export async function refuseUnacceptedCheckout(
  input: {
    businessId: string;
    mpPreapprovalId: string;
    snapshot: CheckoutTerms;
    local: CheckoutLocalState | null;
  },
  deps: CheckoutTermsDeps,
): Promise<CheckoutTermsRefusal | null> {
  if (input.snapshot.status !== "authorized") return null;
  if (wasEverAuthorized(input.local)) return null;
  const refusal = refuseCheckoutTerms(input.snapshot, deps.currentPriceCents);
  if (!refusal) return null;

  const report = refusal === "stale_price" ? deps.reportStalePriceCharge : deps.reportUnexpectedTermsCharge;
  await report({ businessId: input.businessId, mpPreapprovalId: input.mpPreapprovalId });
  await deps.cancelPreapproval(input.mpPreapprovalId);
  return refusal;
}

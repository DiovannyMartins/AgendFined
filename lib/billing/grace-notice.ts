// What the dono must know while the negócio is PROFISSIONAL only because of
// the carência (issue #151, ADR 0008): why the assinatura stopped and until
// when the PROFISSIONAL stays active. Shared by the "Plano" section and the
// painel banner so both tell the same story. A `paused` assinatura means the
// Mercado Pago could not charge the card, not that the dono gave up, so it is
// told apart from a cancellation.
import type { GetSubscriptionResult } from "./get-subscription";
import { isGraceActive, isSubscriptionInGrace } from "./types";

export type GraceReason = "payment_failed" | "cancelled";

export interface GraceNotice {
  reason: GraceReason;
  // When the carência ends and the negócio goes back to Grátis.
  activeUntil: string;
  // A new checkout was opened during the carência and is not paid yet.
  checkoutInProgress: boolean;
}

export function graceNotice(result: GetSubscriptionResult, now: Date = new Date()): GraceNotice | null {
  if (result.plan !== "pro") return null;
  const { subscription, graceSubscription } = result;
  const checkoutInProgress = subscription?.status === "pending" && graceSubscription !== null;
  const graceRow = checkoutInProgress
    ? graceSubscription
    : isSubscriptionInGrace(subscription?.status)
      ? subscription
      : null;
  if (!graceRow?.gracePeriodEnd || !isGraceActive(graceRow.gracePeriodEnd, now)) return null;

  return {
    reason: graceRow.status === "paused" ? "payment_failed" : "cancelled",
    activeUntil: graceRow.gracePeriodEnd,
    checkoutInProgress,
  };
}

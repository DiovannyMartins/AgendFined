import { describe, expect, it } from "vitest";
import { graceNotice } from "./grace-notice";
import type { BillingSubscription, SubscriptionStatus } from "./types";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const GRACE_END = "2026-10-27T12:00:00.000Z";

function row(status: SubscriptionStatus, gracePeriodEnd: string | null = null): BillingSubscription {
  return {
    mpPreapprovalId: `mp_${status}`,
    status,
    plan: "pro",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    gracePeriodEnd,
  };
}

describe("graceNotice", () => {
  it("tells a failed payment apart from a cancellation", () => {
    expect(graceNotice({ plan: "pro", subscription: row("paused", GRACE_END), graceSubscription: null }, NOW)).toEqual({
      reason: "payment_failed",
      activeUntil: GRACE_END,
      checkoutInProgress: false,
    });
    expect(
      graceNotice({ plan: "pro", subscription: row("cancelled", GRACE_END), graceSubscription: null }, NOW),
    ).toEqual({ reason: "cancelled", activeUntil: GRACE_END, checkoutInProgress: false });
  });

  it("uses the older grace row while a new checkout is still unpaid", () => {
    expect(
      graceNotice({ plan: "pro", subscription: row("pending"), graceSubscription: row("paused", GRACE_END) }, NOW),
    ).toEqual({ reason: "payment_failed", activeUntil: GRACE_END, checkoutInProgress: true });
  });

  it("says nothing for an active assinatura, a Grátis negócio or an expired grace", () => {
    expect(graceNotice({ plan: "pro", subscription: row("authorized"), graceSubscription: null }, NOW)).toBeNull();
    expect(graceNotice({ plan: "free", subscription: row("cancelled", GRACE_END), graceSubscription: null }, NOW)).toBeNull();
    expect(
      graceNotice({ plan: "pro", subscription: row("paused", "2026-10-19T12:00:00.000Z"), graceSubscription: null }, NOW),
    ).toBeNull();
  });
});

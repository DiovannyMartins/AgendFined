import { describe, expect, it } from "vitest";
import { snapshotGraceEnd } from "./grace";

const NOW = new Date("2026-11-01T12:00:00.000Z");

// An assinatura created during the teste grátis is `authorized` without any
// payment until its start_date, and Mercado Pago's next_payment_date is the end
// of the teste (ADR 0013). Cancelling it before the first charge follows the
// ADR 0008 rule for any authorized assinatura.
describe("snapshotGraceEnd for an assinatura created during the teste grátis", () => {
  const cancelledBeforeFirstCharge = (snapshotPeriodEnd: string) =>
    snapshotGraceEnd({
      now: NOW,
      localStatus: "authorized",
      existingGracePeriodEnd: null,
      snapshotStatus: "cancelled",
      snapshotPeriodEnd,
    });

  it("keeps the access until the first charge date (the end of the teste)", () => {
    expect(cancelledBeforeFirstCharge("2026-11-20T15:30:00.000Z")).toBe("2026-11-20T15:30:00.000Z");
  });

  it("keeps at least 7 days when the teste ends sooner", () => {
    expect(cancelledBeforeFirstCharge("2026-11-03T12:00:00.000Z")).toBe("2026-11-08T12:00:00.000Z");
  });

  it("closes a checkout never authorized without a carência", () => {
    expect(
      snapshotGraceEnd({
        now: NOW,
        localStatus: "pending",
        existingGracePeriodEnd: null,
        snapshotStatus: "cancelled",
        snapshotPeriodEnd: "2026-11-20T15:30:00.000Z",
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { gracePeriodForSnapshot } from "./reconciliation-runner";

describe("reconciliation grace preservation", () => {
  const grace = "2026-09-20T00:00:00.000Z";

  it("clears grace only for authorized", () => {
    expect(gracePeriodForSnapshot("authorized", grace)).toBeNull();
  });

  it("preserves grace for pending, paused and cancelled", () => {
    expect(gracePeriodForSnapshot("pending", grace)).toBe(grace);
    expect(gracePeriodForSnapshot("paused", grace)).toBe(grace);
    expect(gracePeriodForSnapshot("cancelled", grace)).toBe(grace);
  });

  it("does not invent a grace period", () => {
    expect(gracePeriodForSnapshot("paused", null)).toBeNull();
    expect(gracePeriodForSnapshot("cancelled", undefined)).toBeNull();
  });
});

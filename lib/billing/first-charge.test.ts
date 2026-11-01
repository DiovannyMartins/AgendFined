import { describe, expect, it } from "vitest";
import { firstChargeDate } from "./first-charge";

const NOW = new Date("2026-11-01T12:00:00.000Z");

describe("firstChargeDate", () => {
  it("is the end of a teste grátis still running", () => {
    expect(firstChargeDate("2026-11-20T15:30:00+00:00", NOW)).toBe("2026-11-20T15:30:00.000Z");
  });

  it("is now (null) without a teste", () => {
    expect(firstChargeDate(null, NOW)).toBeNull();
  });

  it("is now (null) after the teste ended", () => {
    expect(firstChargeDate("2026-10-31T12:00:00.000Z", NOW)).toBeNull();
  });

  // Mercado Pago refuses a start_date in the past; one only minutes ahead could
  // be past by the time the request arrives.
  it("is now (null) when the teste ends within the minimum lead", () => {
    expect(firstChargeDate("2026-11-01T12:09:00.000Z", NOW)).toBeNull();
    expect(firstChargeDate("2026-11-01T12:11:00.000Z", NOW)).toBe("2026-11-01T12:11:00.000Z");
  });
});

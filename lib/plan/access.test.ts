import { describe, expect, it } from "vitest";
import { assertAccess, getEffectiveBookingWindowDays, hasAccess } from "@/lib/plan/access";
import { runAccessGated } from "@/lib/plan/gate";

describe("assertAccess (ADR 0013)", () => {
  it("returns ok for a negócio with access", () => {
    expect(assertAccess({ has_access: true })).toEqual({ ok: true });
  });

  it("returns ACCESS_REQUIRED for a suspended negócio", () => {
    expect(assertAccess({ has_access: false })).toEqual({ ok: false, code: "ACCESS_REQUIRED" });
  });

  it("fails closed when the access is unknown", () => {
    expect(assertAccess({ has_access: null })).toEqual({ ok: false, code: "ACCESS_REQUIRED" });
    expect(assertAccess({})).toEqual({ ok: false, code: "ACCESS_REQUIRED" });
    expect(hasAccess({})).toBe(false);
  });
});

describe("getEffectiveBookingWindowDays", () => {
  it("caps the configured janela at the 365 days of the Plano AgendFined", () => {
    expect(getEffectiveBookingWindowDays(60)).toBe(60);
    expect(getEffectiveBookingWindowDays(365)).toBe(365);
    expect(getEffectiveBookingWindowDays(400)).toBe(365);
  });
});

describe("runAccessGated", () => {
  it("fetches only for a negócio with access", async () => {
    const fetch = async (id: string) => `data-${id}`;
    expect(await runAccessGated({ id: "b", has_access: true }, fetch)).toEqual({ status: "ok", data: "data-b" });
    expect(await runAccessGated({ id: "b", has_access: false }, fetch)).toEqual({ status: "access_required" });
    expect(await runAccessGated(null, fetch)).toEqual({ status: "no_business" });
  });

  it("maps a failed fetch to error", async () => {
    const result = await runAccessGated({ id: "b", has_access: true }, async () => {
      throw new Error("boom");
    });
    expect(result).toEqual({ status: "error" });
  });
});

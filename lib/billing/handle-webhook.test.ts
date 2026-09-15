import { describe, expect, it, vi } from "vitest";
import { handleWebhook, type HandleWebhookDeps, type PreapprovalResource } from "./handle-webhook";

const NOW = new Date("2026-09-07T12:00:00.000Z");

function makePreapproval(status: PreapprovalResource["status"], overrides: Partial<PreapprovalResource> = {}): PreapprovalResource {
  return {
    status,
    externalReference: "biz_1",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<HandleWebhookDeps> = {}) {
  const deps: HandleWebhookDeps = {
    event: { type: "preapproval", dataId: "mp_1" },
    getPreapproval: vi.fn(async () => makePreapproval("authorized")),
    findSubscription: vi.fn(async () => ({
      id: "sub_1",
      businessId: "biz_1",
      mpPreapprovalId: "mp_1",
      status: "pending" as const,
      plan: "free" as const,
      gracePeriodEnd: null,
    })),
    setPlan: vi.fn(async () => undefined),
    updateSubscription: vi.fn(async () => undefined),
    now: () => NOW,
    ...overrides,
  };
  return deps;
}

describe("handleWebhook (issue #24) lifecycle", () => {
  it("authorized marks the business pro and authorizes the subscription", async () => {
    const deps = makeDeps();
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(deps.setPlan).toHaveBeenCalledWith("biz_1", "pro");
    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "authorized",
      plan: "pro",
      gracePeriodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
  });

  it("authorized clears a previous grace period", async () => {
    const deps = makeDeps({
      getPreapproval: vi.fn(async () =>
        makePreapproval("authorized", {
          currentPeriodStart: "2026-09-01T00:00:00.000Z",
          currentPeriodEnd: "2026-10-01T00:00:00.000Z",
        }),
      ),
    });
    await handleWebhook(deps);

    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "authorized",
      plan: "pro",
      gracePeriodEnd: null,
      currentPeriodStart: "2026-09-01T00:00:00.000Z",
      currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    });
  });

  it("paused starts a 7-day grace and keeps the plan untouched", async () => {
    const deps = makeDeps({ getPreapproval: vi.fn(async () => makePreapproval("paused")) });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(deps.setPlan).not.toHaveBeenCalled();
    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "paused",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    });
  });

  it("cancelled starts a 7-day grace and keeps the plan untouched", async () => {
    const deps = makeDeps({ getPreapproval: vi.fn(async () => makePreapproval("cancelled")) });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(deps.setPlan).not.toHaveBeenCalled();
    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "cancelled",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    });
  });

  it("pending only updates the subscription status, never the plan", async () => {
    const deps = makeDeps({ getPreapproval: vi.fn(async () => makePreapproval("pending")) });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "pending" });
    expect(deps.setPlan).not.toHaveBeenCalled();
    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", { status: "pending" });
  });

  it("ignores a non-preapproval notification without touching the database", async () => {
    const deps = makeDeps({ event: { type: "payment", dataId: "pay_1" } });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "ignored" });
    expect(deps.getPreapproval).not.toHaveBeenCalled();
    expect(deps.findSubscription).not.toHaveBeenCalled();
    expect(deps.setPlan).not.toHaveBeenCalled();
    expect(deps.updateSubscription).not.toHaveBeenCalled();
  });

  it("maps a preapproval fetch failure to PROVIDER_ERROR", async () => {
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => {
        throw new Error("Mercado Pago preapproval fetch failed (404)");
      }),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: false, code: "PROVIDER_ERROR", message: "Mercado Pago preapproval fetch failed (404)" });
    expect(deps.setPlan).not.toHaveBeenCalled();
    expect(deps.updateSubscription).not.toHaveBeenCalled();
  });

  it("rejects an unregistered preapproval instead of trusting external_reference", async () => {
    const deps = makeDeps({ findSubscription: vi.fn(async () => null) });
    const result = await handleWebhook(deps);

    expect(result).toEqual({
      ok: false,
      code: "UNKNOWN_SUBSCRIPTION",
      message: expect.any(String),
    });
    expect(deps.setPlan).not.toHaveBeenCalled();
  });

  it("fails when no business can be resolved", async () => {
    const deps = makeDeps({
      findSubscription: vi.fn(async () => null),
      getPreapproval: vi.fn(async () => makePreapproval("authorized", { externalReference: null })),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: false, code: "UNKNOWN_SUBSCRIPTION", message: expect.any(String) });
    expect(deps.setPlan).not.toHaveBeenCalled();
  });

  it("honours a configurable grace period", async () => {
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      graceDays: 3,
    });
    await handleWebhook(deps);

    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "paused",
      gracePeriodEnd: "2026-09-10T12:00:00.000Z",
    });
  });

  it("accepts the subscription_preapproval type Mercado Pago sends", async () => {
    const deps = makeDeps({ event: { type: "subscription_preapproval", dataId: "mp_1" } });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(deps.setPlan).toHaveBeenCalledWith("biz_1", "pro");
  });

  it("preserves an existing future grace period on a paused retry", async () => {
    const futureGrace = "2026-09-20T12:00:00.000Z";
    const deps = makeDeps({
      getPreapproval: vi.fn(async () => makePreapproval("paused")),
      findSubscription: vi.fn(async () => ({
        id: "sub_1",
        businessId: "biz_1",
        mpPreapprovalId: "mp_1",
        status: "paused" as const,
        plan: "free" as const,
        gracePeriodEnd: futureGrace,
      })),
    });
    const result = await handleWebhook(deps);

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "paused",
      gracePeriodEnd: futureGrace,
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { cancelSubscription, type CancelSubscriptionDeps } from "./cancel-subscription";
import type { BillingProvider } from "./provider";

const NOW = new Date("2026-09-07T12:00:00.000Z");

function makeDeps(overrides: Partial<CancelSubscriptionDeps> = {}): CancelSubscriptionDeps {
  return {
    business: { id: "biz_1", plan: "pro" },
    provider: {
      createPreapproval: vi.fn(),
      getPreapproval: vi.fn(),
      cancelPreapproval: vi.fn(async () => undefined),
    } as BillingProvider,
    fetchSubscription: vi.fn(async () => ({
      mpPreapprovalId: "mp_1",
      status: "authorized" as const,
      plan: "pro" as const,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    })),
    updateSubscription: vi.fn(async () => undefined),
    now: () => NOW,
    ...overrides,
  };
}

describe("cancelSubscription (US16)", () => {
  it("cancels the preapproval at the provider and records a cancelled grace period", async () => {
    const deps = makeDeps();
    const result = await cancelSubscription(deps);

    expect(result).toEqual({ ok: true });
    expect(deps.provider.cancelPreapproval).toHaveBeenCalledWith("mp_1");
    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "cancelled",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    });
  });

  it("fails when there is no active subscription", async () => {
    const deps = makeDeps({ fetchSubscription: vi.fn(async () => null) });
    const result = await cancelSubscription(deps);

    expect(result).toEqual({
      ok: false,
      code: "NO_ACTIVE_SUBSCRIPTION",
      message: expect.any(String),
    });
    expect(deps.provider.cancelPreapproval).not.toHaveBeenCalled();
  });

  it("fails when the subscription is not authorized", async () => {
    const deps = makeDeps({
      fetchSubscription: vi.fn(async () => ({
        mpPreapprovalId: "mp_1",
        status: "pending" as const,
        plan: "pro" as const,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      })),
    });
    const result = await cancelSubscription(deps);

    expect(result).toEqual({ ok: false, code: "NO_ACTIVE_SUBSCRIPTION", message: expect.any(String) });
  });

  it("maps a provider failure to PROVIDER_ERROR", async () => {
    const deps = makeDeps({
      provider: {
        createPreapproval: vi.fn(),
        getPreapproval: vi.fn(),
        cancelPreapproval: vi.fn(async () => {
          throw new Error("Mercado Pago preapproval cancel failed (400)");
        }),
      } as unknown as BillingProvider,
    });
    const result = await cancelSubscription(deps);

    expect(result).toEqual({ ok: false, code: "PROVIDER_ERROR", message: "Não foi possível cancelar a assinatura. Tente novamente." });
    expect(JSON.stringify(result)).not.toContain("Mercado Pago preapproval cancel failed");
  });

  it("honours a configurable grace period", async () => {
    const deps = makeDeps({ graceDays: 3 });
    await cancelSubscription(deps);

    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "cancelled",
      gracePeriodEnd: "2026-09-10T12:00:00.000Z",
    });
  });

  it("reports a persistence failure after provider cancellation", async () => {
    const deps = makeDeps({
      updateSubscription: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });

    const result = await cancelSubscription(deps);

    expect(result).toEqual({ ok: false, code: "SAVE_ERROR", message: "A assinatura foi cancelada, mas a atualização está pendente. Contate o suporte." });
    expect(JSON.stringify(result)).not.toContain("database unavailable");
  });
});

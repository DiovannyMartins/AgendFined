import { describe, expect, it, vi } from "vitest";
import { cancelSubscription, type CancelSubscriptionDeps } from "./cancel-subscription";
import type { BillingProvider, Preapproval } from "./provider";

const NOW = new Date("2026-09-07T12:00:00.000Z");

// What `GET /preapproval/{id}` reports for the authorized assinatura: the paid
// period ends on the next charge.
function preapproval(currentPeriodEnd: string | null): Preapproval {
  return {
    id: "mp_1",
    status: "authorized",
    externalReference: "biz_1",
    currentPeriodStart: null,
    currentPeriodEnd,
    transactionAmount: 19.9,
    currencyId: "BRL",
    frequency: 1,
    frequencyType: "months",
  };
}

function makeDeps(overrides: Partial<CancelSubscriptionDeps> = {}): CancelSubscriptionDeps {
  return {
    business: { id: "biz_1", plan: "pro" },
    provider: {
      createPreapproval: vi.fn(),
      getPreapproval: vi.fn(async () => preapproval(null)),
      cancelPreapproval: vi.fn(async () => undefined),
      updatePreapprovalAmount: vi.fn(),
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

  it("keeps the PROFISSIONAL until the end of the paid month (issue #142)", async () => {
    const deps = makeDeps();
    vi.mocked(deps.provider.getPreapproval).mockResolvedValue(preapproval("2026-10-07T12:00:00.000Z"));

    const result = await cancelSubscription(deps);

    expect(result).toEqual({ ok: true });
    expect(deps.provider.getPreapproval).toHaveBeenCalledWith("mp_1");
    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "cancelled",
      gracePeriodEnd: "2026-10-07T12:00:00.000Z",
    });
  });

  it("keeps at least the 7-day grace when the paid period ends sooner", async () => {
    const deps = makeDeps();
    vi.mocked(deps.provider.getPreapproval).mockResolvedValue(preapproval("2026-09-09T12:00:00.000Z"));

    await cancelSubscription(deps);

    expect(deps.updateSubscription).toHaveBeenCalledWith("mp_1", {
      status: "cancelled",
      gracePeriodEnd: "2026-09-14T12:00:00.000Z",
    });
  });

  it("does not cancel when the paid period cannot be read", async () => {
    const deps = makeDeps();
    vi.mocked(deps.provider.getPreapproval).mockRejectedValue(new Error("Mercado Pago preapproval fetch timed out"));

    const result = await cancelSubscription(deps);

    expect(result).toEqual({ ok: false, code: "PROVIDER_ERROR", message: "Não foi possível cancelar a assinatura. Tente novamente." });
    expect(deps.provider.cancelPreapproval).not.toHaveBeenCalled();
    expect(deps.updateSubscription).not.toHaveBeenCalled();
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
        getPreapproval: vi.fn(async () => preapproval(null)),
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

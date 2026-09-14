import { describe, expect, it, vi } from "vitest";
import { retryPendingUpgrade, type RetryUpgradeDeps } from "./retry-upgrade";
import type { BillingProvider } from "./provider";

function makeDeps(overrides: Partial<RetryUpgradeDeps> = {}): RetryUpgradeDeps {
  return {
    business: { id: "biz_1" },
    provider: {
      createPreapproval: vi.fn(async () => ({ preapprovalId: "mp_new", initPoint: "https://mp.example/new" })),
      getPreapproval: vi.fn(),
      cancelPreapproval: vi.fn(async () => undefined),
    } as BillingProvider,
    fetchSubscription: vi.fn(async () => ({
      mpPreapprovalId: "mp_old",
      status: "pending" as const,
      plan: "pro" as const,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    })),
    replaceSubscription: vi.fn(async () => undefined),
    backUrl: "https://app.example/dashboard/configuracoes",
    ...overrides,
  };
}

describe("retryPendingUpgrade", () => {
  it("creates a fresh preapproval and repoints the pending row at it", async () => {
    const deps = makeDeps();
    const result = await retryPendingUpgrade(deps);

    expect(result).toEqual({ ok: true, initPoint: "https://mp.example/new" });
    expect(deps.provider.createPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro", externalReference: "biz_1" }),
    );
    expect(deps.replaceSubscription).toHaveBeenCalledWith("mp_old", { mpPreapprovalId: "mp_new" });
  });

  it("cancels the stale pending preapproval best-effort", async () => {
    const deps = makeDeps();
    await retryPendingUpgrade(deps);

    expect(deps.provider.cancelPreapproval).toHaveBeenCalledWith("mp_old");
  });

  it("still retries when cancelling the stale preapproval fails", async () => {
    const deps = makeDeps({
      provider: {
        createPreapproval: vi.fn(async () => ({ preapprovalId: "mp_new", initPoint: "https://mp.example/new" })),
        getPreapproval: vi.fn(),
        cancelPreapproval: vi.fn(async () => {
          throw new Error("cannot cancel");
        }),
      } as unknown as BillingProvider,
    });
    const result = await retryPendingUpgrade(deps);

    expect(result).toEqual({ ok: true, initPoint: "https://mp.example/new" });
    expect(deps.replaceSubscription).toHaveBeenCalledWith("mp_old", { mpPreapprovalId: "mp_new" });
  });

  it("fails when there is no subscription", async () => {
    const deps = makeDeps({ fetchSubscription: vi.fn(async () => null) });
    const result = await retryPendingUpgrade(deps);

    expect(result).toEqual({ ok: false, code: "NO_PENDING_SUBSCRIPTION", message: expect.any(String) });
    expect(deps.provider.createPreapproval).not.toHaveBeenCalled();
  });

  it("fails when the current subscription is not pending", async () => {
    const deps = makeDeps({
      fetchSubscription: vi.fn(async () => ({
        mpPreapprovalId: "mp_1",
        status: "cancelled" as const,
        plan: "pro" as const,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      })),
    });
    const result = await retryPendingUpgrade(deps);

    expect(result).toEqual({ ok: false, code: "NO_PENDING_SUBSCRIPTION", message: expect.any(String) });
    expect(deps.provider.createPreapproval).not.toHaveBeenCalled();
  });

  it("maps a provider failure to PROVIDER_ERROR and never replaces", async () => {
    const deps = makeDeps({
      provider: {
        createPreapproval: vi.fn(async () => {
          throw new Error("Mercado Pago preapproval failed (401)");
        }),
        getPreapproval: vi.fn(),
        cancelPreapproval: vi.fn(),
      } as unknown as BillingProvider,
    });
    const result = await retryPendingUpgrade(deps);

    expect(result).toEqual({ ok: false, code: "PROVIDER_ERROR", message: "Mercado Pago preapproval failed (401)" });
    expect(deps.replaceSubscription).not.toHaveBeenCalled();
  });

  it("maps a replace failure to SAVE_ERROR", async () => {
    const deps = makeDeps({
      replaceSubscription: vi.fn(async () => {
        throw new Error("update failed");
      }),
    });
    const result = await retryPendingUpgrade(deps);

    expect(result).toEqual({ ok: false, code: "SAVE_ERROR", message: "update failed" });
  });
});

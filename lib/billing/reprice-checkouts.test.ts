import { describe, expect, it, vi } from "vitest";
import type { Preapproval } from "./provider";
import { repricePendingCheckouts, type RepriceCheckoutsDeps } from "./reprice-checkouts";

function snapshot(id: string, overrides: Partial<Preapproval> = {}): Preapproval {
  return {
    id,
    status: "pending",
    externalReference: "att_1",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    transactionAmount: 19,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<RepriceCheckoutsDeps> = {}): RepriceCheckoutsDeps {
  return {
    listPendingCheckouts: vi.fn(async () => ["mp_old"]),
    getPreapproval: vi.fn(async (id: string) => snapshot(id)),
    updatePreapprovalAmount: vi.fn(async () => undefined),
    cancelPreapproval: vi.fn(async () => undefined),
    currentPriceCents: 1990,
    ...overrides,
  };
}

describe("repricePendingCheckouts", () => {
  it("brings a pending checkout created at an older price up to the current price", async () => {
    const deps = makeDeps();

    const result = await repricePendingCheckouts(deps);

    expect(deps.updatePreapprovalAmount).toHaveBeenCalledWith("mp_old", 1990);
    expect(deps.cancelPreapproval).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, repriced: 1, cancelled: 0, failed: 0 });
  });

  it("leaves checkouts already at the current price or no longer pending at the provider", async () => {
    const deps = makeDeps({
      listPendingCheckouts: vi.fn(async () => ["mp_current", "mp_paid", "mp_closed"]),
      getPreapproval: vi.fn(async (id: string) =>
        snapshot(id, {
          mp_current: { transactionAmount: 19.9 },
          mp_paid: { status: "authorized" as const },
          mp_closed: { status: "cancelled" as const },
        }[id]),
      ),
    });

    const result = await repricePendingCheckouts(deps);

    expect(deps.updatePreapprovalAmount).not.toHaveBeenCalled();
    expect(deps.cancelPreapproval).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 3, repriced: 0, cancelled: 0, failed: 0 });
  });

  it("cancels a checkout whose amount Mercado Pago refuses to update, so the old price is never payable", async () => {
    const deps = makeDeps({
      updatePreapprovalAmount: vi.fn(async () => {
        throw new Error("Mercado Pago preapproval amount update failed (400)");
      }),
    });

    const result = await repricePendingCheckouts(deps);

    expect(deps.cancelPreapproval).toHaveBeenCalledWith("mp_old");
    expect(result).toEqual({ checked: 1, repriced: 0, cancelled: 1, failed: 0 });
  });

  it("counts a checkout it could not handle and keeps going with the next ones", async () => {
    const deps = makeDeps({
      listPendingCheckouts: vi.fn(async () => ["mp_down", "mp_old"]),
      getPreapproval: vi.fn(async (id: string) => {
        if (id === "mp_down") throw new Error("Mercado Pago preapproval fetch timed out");
        return snapshot(id);
      }),
    });

    const result = await repricePendingCheckouts(deps);

    expect(deps.updatePreapprovalAmount).toHaveBeenCalledWith("mp_old", 1990);
    expect(result).toEqual({ checked: 2, repriced: 1, cancelled: 0, failed: 1 });
  });
});

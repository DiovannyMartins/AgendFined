import { describe, expect, it, vi } from "vitest";
import type { BillingSubscription } from "./types";
import type { Preapproval } from "./provider";
import type { AppliedSubscriptionSnapshot, ApplySubscriptionSnapshotInput } from "./handle-webhook";
import { syncReturnedSubscription, type ReturnSyncDeps } from "./return-sync";

const pendingCheckout: BillingSubscription = {
  subscriptionId: "sub_1",
  mpPreapprovalId: "mp_1",
  status: "pending",
  plan: "pro",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  gracePeriodEnd: null,
};

const authorizedSnapshot: Preapproval = {
  id: "mp_1",
  status: "authorized",
  externalReference: "attempt_1",
  currentPeriodStart: "2026-09-21T00:00:00.000Z",
  currentPeriodEnd: "2026-10-21T00:00:00.000Z",
  transactionAmount: null,
  currencyId: null,
  frequency: null,
  frequencyType: null,
};

function deps(current: BillingSubscription, snapshot: Preapproval, overrides: Partial<ReturnSyncDeps> = {}): ReturnSyncDeps {
  return {
    fetchSubscription: vi.fn(async () => current),
    getPreapproval: vi.fn(async () => snapshot),
    applySnapshot: vi.fn(async (input: ApplySubscriptionSnapshotInput): Promise<AppliedSubscriptionSnapshot> => ({
      subscriptionId: input.subscriptionId,
      businessId: input.businessId,
      subscriptionStatus: input.status,
      isCurrent: true,
      effectivePlan: input.status === "authorized" ? ("pro" as const) : ("free" as const),
      effectiveGracePeriodEnd: null,
    })),
    cancelPreapproval: vi.fn(async () => undefined),
    currentPriceCents: 1990,
    reportStalePriceCharge: vi.fn(),
    reportUnexpectedTermsCharge: vi.fn(),
    ...overrides,
  };
}

describe("syncReturnedSubscription", () => {
  it("aplica o status autorizado confirmado pelo provedor no retorno do checkout", async () => {
    const d = deps(pendingCheckout, authorizedSnapshot);

    const result = await syncReturnedSubscription("biz_1", d);

    expect(result).toEqual({ ok: true, status: "authorized", effectivePlan: "pro" });
    expect(d.applySnapshot).toHaveBeenCalledWith({
      businessId: "biz_1",
      subscriptionId: "sub_1",
      mpPreapprovalId: "mp_1",
      status: "authorized",
      currentPeriodStart: "2026-09-21T00:00:00.000Z",
      currentPeriodEnd: "2026-10-21T00:00:00.000Z",
      gracePeriodEnd: null,
    });
  });

  it("não ativa um checkout pago abaixo do preço atual: registra para estorno e cancela", async () => {
    const d = deps(pendingCheckout, { ...authorizedSnapshot, transactionAmount: 19, currencyId: "BRL", frequency: 1, frequencyType: "months" });

    const result = await syncReturnedSubscription("biz_1", d);

    expect(result).toEqual({ ok: true, status: "refused", refusal: "stale_price", effectivePlan: null });
    expect(d.applySnapshot).not.toHaveBeenCalled();
    expect(d.reportStalePriceCharge).toHaveBeenCalledWith({ businessId: "biz_1", mpPreapprovalId: "mp_1" });
    expect(d.cancelPreapproval).toHaveBeenCalledWith("mp_1");
  });

  it("não ativa um checkout pago em outra moeda: registra para estorno e cancela", async () => {
    const d = deps(pendingCheckout, { ...authorizedSnapshot, transactionAmount: 19.9, currencyId: "USD", frequency: 1, frequencyType: "months" });

    const result = await syncReturnedSubscription("biz_1", d);

    expect(result).toEqual({ ok: true, status: "refused", refusal: "unexpected_terms", effectivePlan: null });
    expect(d.applySnapshot).not.toHaveBeenCalled();
    expect(d.reportUnexpectedTermsCharge).toHaveBeenCalledWith({ businessId: "biz_1", mpPreapprovalId: "mp_1" });
    expect(d.cancelPreapproval).toHaveBeenCalledWith("mp_1");
  });

  it("não ativa quando o cancelamento do checkout recusado falha", async () => {
    const d = deps(
      pendingCheckout,
      { ...authorizedSnapshot, transactionAmount: 19, currencyId: "BRL", frequency: 1, frequencyType: "months" },
      { cancelPreapproval: vi.fn(async () => { throw new Error("Mercado Pago preapproval cancel failed (500)"); }) },
    );

    await expect(syncReturnedSubscription("biz_1", d)).rejects.toThrow("preapproval cancel failed");
    expect(d.reportStalePriceCharge).toHaveBeenCalledWith({ businessId: "biz_1", mpPreapprovalId: "mp_1" });
    expect(d.applySnapshot).not.toHaveBeenCalled();
  });

  it("continua aplicando a renovação de quem já assina pelo preço antigo", async () => {
    const d = deps(
      { ...pendingCheckout, status: "authorized" },
      { ...authorizedSnapshot, transactionAmount: 19, currencyId: "BRL", frequency: 1, frequencyType: "months" },
    );

    const result = await syncReturnedSubscription("biz_1", d);

    expect(result).toEqual({ ok: true, status: "authorized", effectivePlan: "pro" });
    expect(d.cancelPreapproval).not.toHaveBeenCalled();
    expect(d.reportStalePriceCharge).not.toHaveBeenCalled();
  });
});

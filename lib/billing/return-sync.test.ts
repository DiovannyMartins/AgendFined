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
      previousStatus: current.status,
      applied: true,
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
      providerModifiedAt: null,
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

describe("syncReturnedSubscription carência (ADR 0008)", () => {
  const NOW = new Date("2026-10-26T12:00:00.000Z");
  const authorizedLocal: BillingSubscription = { ...pendingCheckout, status: "authorized" };

  it("abre a carência mínima quando o retorno encontra a assinatura pausada antes do webhook", async () => {
    const d = deps(authorizedLocal, { ...authorizedSnapshot, status: "paused" }, { now: () => NOW });

    await syncReturnedSubscription("biz_1", d);

    expect(d.applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paused", gracePeriodEnd: "2026-11-02T12:00:00.000Z" }),
    );
  });

  it("mantém o mês pago ao encontrar a assinatura cancelada antes do webhook", async () => {
    const d = deps(
      authorizedLocal,
      { ...authorizedSnapshot, status: "cancelled", currentPeriodEnd: "2026-11-20T00:00:00.000Z" },
      { now: () => NOW },
    );

    await syncReturnedSubscription("biz_1", d);

    expect(d.applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", gracePeriodEnd: "2026-11-20T00:00:00.000Z" }),
    );
  });

  it("preserva uma carência futura já registrada", async () => {
    const d = deps(
      { ...authorizedLocal, status: "paused", gracePeriodEnd: "2026-10-30T00:00:00.000Z" },
      { ...authorizedSnapshot, status: "paused" },
      { now: () => NOW },
    );

    await syncReturnedSubscription("biz_1", d);

    expect(d.applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ gracePeriodEnd: "2026-10-30T00:00:00.000Z" }),
    );
  });

  it("não reabre uma carência vencida ao reler uma assinatura já cancelada (issue #242)", async () => {
    const lapsedGrace = "2026-10-26T11:59:00.000Z";
    const d = deps(
      { ...authorizedLocal, status: "cancelled", gracePeriodEnd: lapsedGrace },
      { ...authorizedSnapshot, status: "cancelled", currentPeriodEnd: "2026-11-20T00:00:00.000Z" },
      { now: () => NOW },
    );

    await syncReturnedSubscription("biz_1", d);

    expect(d.applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", gracePeriodEnd: lapsedGrace }),
    );
  });

  it("respeita a carência configurada", async () => {
    const d = deps(authorizedLocal, { ...authorizedSnapshot, status: "paused" }, { now: () => NOW, graceDays: 3 });

    await syncReturnedSubscription("biz_1", d);

    expect(d.applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ gracePeriodEnd: "2026-10-29T12:00:00.000Z" }),
    );
  });

  it("fecha sem carência um checkout que nunca foi pago", async () => {
    const d = deps(pendingCheckout, { ...authorizedSnapshot, status: "cancelled" }, { now: () => NOW });

    await syncReturnedSubscription("biz_1", d);

    expect(d.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled", gracePeriodEnd: null }));
  });

  it("passa o last_modified do provedor como versão do retrato", async () => {
    const d = deps(authorizedLocal, { ...authorizedSnapshot, lastModified: "2026-10-26T11:00:00.000Z" }, { now: () => NOW });

    await syncReturnedSubscription("biz_1", d);

    expect(d.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({ providerModifiedAt: "2026-10-26T11:00:00.000Z" }));
  });

  it("devolve o estado guardado quando o banco recusa um retrato antigo", async () => {
    const d = deps(authorizedLocal, authorizedSnapshot, {
      applySnapshot: vi.fn(async (input: ApplySubscriptionSnapshotInput): Promise<AppliedSubscriptionSnapshot> => ({
        subscriptionId: input.subscriptionId,
        businessId: input.businessId,
        subscriptionStatus: "cancelled",
        previousStatus: "cancelled",
        applied: false,
        isCurrent: true,
        effectivePlan: "pro",
        effectiveGracePeriodEnd: "2026-11-20T00:00:00.000Z",
      })),
    });

    await expect(syncReturnedSubscription("biz_1", d)).resolves.toEqual({ ok: true, status: "cancelled", effectivePlan: "pro" });
  });
});

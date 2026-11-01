import { describe, expect, it, vi } from "vitest";
import { retryPendingUpgrade, type RetryUpgradeDeps } from "./retry-upgrade";
import { MercadoPagoAmbiguousError } from "./mercado-pago";
import type { BillingProvider } from "./provider";

const existing = { subscriptionId: "sub_old", mpPreapprovalId: "mp_old", status: "pending" as const, currentPeriodStart: null, currentPeriodEnd: null };
function provider(): BillingProvider { return { createPreapproval: vi.fn(async () => ({ preapprovalId: "mp_new", initPoint: "https://mp.example/new" })), getPreapproval: vi.fn(), cancelPreapproval: vi.fn(async () => undefined), updatePreapprovalAmount: vi.fn() }; }
function deps(overrides: Partial<RetryUpgradeDeps> = {}): RetryUpgradeDeps {
  return {
    business: { id: "biz_1", trialEndsAt: null }, provider: provider(), now: () => new Date("2026-11-01T12:00:00.000Z"), fetchSubscription: vi.fn(async () => existing),
    claimAttempt: vi.fn(async () => ({ id: "attempt_retry", businessId: "biz_1", kind: "retry" as const, status: "reserved" as const, idempotencyKey: "key", providerPreapprovalId: null })),
    startRetry: vi.fn(async () => ({ id: "attempt_retry", businessId: "biz_1", kind: "retry" as const, status: "creating" as const, idempotencyKey: "key", providerPreapprovalId: null })),
    finishAttempt: vi.fn(async () => ({ id: "attempt_retry", businessId: "biz_1", kind: "retry" as const, status: "unknown" as const, idempotencyKey: "key", providerPreapprovalId: "mp_new" })),
    linkAttempt: vi.fn(async () => undefined), backUrl: "https://app.example", idempotencyKey: "key",
    reportOrphanCheckout: vi.fn(),
    checkoutLimits: { countPendingCheckouts: vi.fn(async () => 1), consumeCheckout: vi.fn(async () => true) },
    ...overrides,
  };
}

describe("retryPendingUpgrade with billing_attempts", () => {
  it("starts the new checkout's charge at the end of a teste grátis still running", async () => {
    const d = deps({ business: { id: "biz_1", trialEndsAt: "2026-11-20T15:30:00.000Z" } });
    await retryPendingUpgrade(d);
    expect(d.provider.createPreapproval).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-11-20T15:30:00.000Z" }));
  });

  it("charges the new checkout now outside a teste", async () => {
    const d = deps({ business: { id: "biz_1", trialEndsAt: null } });
    await retryPendingUpgrade(d);
    expect(d.provider.createPreapproval).toHaveBeenCalledWith(expect.objectContaining({ startDate: null }));
  });

  it("claims, CAS-validates, creates, and links without cancelling before payment", async () => {
    const d = deps(); const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: true, initPoint: "https://mp.example/new" });
    expect(d.claimAttempt).toHaveBeenCalledWith({ businessId: "biz_1", kind: "retry", expectedSubscriptionId: "sub_old", idempotencyKey: "key" });
    expect(d.startRetry).toHaveBeenCalledWith({ attemptId: "attempt_retry", idempotencyKey: "key", expectedSubscriptionId: "sub_old", expectedMpPreapprovalId: "mp_old" });
    expect(d.provider.createPreapproval).toHaveBeenCalledTimes(1);
    expect(d.linkAttempt).toHaveBeenCalledWith({ attemptId: "attempt_retry", mpPreapprovalId: "mp_new" });
    expect(d.provider.cancelPreapproval).not.toHaveBeenCalled();
  });

  it.each(["unknown", "ambiguous"] as const)("blocks when retry attempt is %s", async (status) => {
    const d = deps({ claimAttempt: vi.fn(async () => ({ id: "a", businessId: "biz_1", kind: "retry" as const, status, idempotencyKey: "key", providerPreapprovalId: null })) });
    const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: false, code: "UPGRADE_RECONCILIATION_REQUIRED", message: expect.any(String) });
    expect(d.provider.createPreapproval).not.toHaveBeenCalled();
  });

  it("does not create when CAS fails", async () => {
    const d = deps({ startRetry: vi.fn(async () => { throw new Error("RETRY_SUBSCRIPTION_CONFLICT"); }) });
    const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: false, code: "RETRY_SUBSCRIPTION_CONFLICT", message: expect.any(String) });
    expect(d.finishAttempt).toHaveBeenCalledWith({ attemptId: "attempt_retry", status: "failed" });
    expect(d.provider.createPreapproval).not.toHaveBeenCalled();
  });

  it("marks clear provider failure failed", async () => {
    const p = provider(); p.createPreapproval = vi.fn(async () => { throw new Error("provider 400"); });
    const d = deps({ provider: p }); await retryPendingUpgrade(d);
    expect(d.finishAttempt).toHaveBeenCalledWith({ attemptId: "attempt_retry", status: "failed" });
  });

  it("marks ambiguous creation and local linking failures unknown", async () => {
    const p = provider(); p.createPreapproval = vi.fn(async () => { throw new MercadoPagoAmbiguousError("timeout"); });
    const d = deps({ provider: p }); const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: false, code: "PROVIDER_UNKNOWN", message: "Não foi possível gerar um novo link de pagamento. Tente novamente." });
    expect(JSON.stringify(result)).not.toContain("timeout");
    expect(d.finishAttempt).toHaveBeenCalledWith({ attemptId: "attempt_retry", status: "unknown" });
  });
});

describe("retryPendingUpgrade when the current assinatura changes while the checkout is created", () => {
  const conflict = () => vi.fn(async () => { throw new Error("CURRENT_SUBSCRIPTION_CONFLICT"); });

  it("records the attempt as failed with the new checkout, then cancels that checkout, whose link is never handed out", async () => {
    const d = deps({ linkAttempt: conflict(), reportOrphanCheckout: vi.fn() });
    const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: false, code: "RETRY_SUBSCRIPTION_CONFLICT", message: expect.any(String) });
    expect(d.finishAttempt).toHaveBeenCalledWith({ attemptId: "attempt_retry", status: "failed", providerPreapprovalId: "mp_new" });
    expect(d.provider.cancelPreapproval).toHaveBeenCalledWith("mp_new");
    expect(d.provider.cancelPreapproval).not.toHaveBeenCalledWith("mp_old");
    expect(vi.mocked(d.finishAttempt).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(d.provider.cancelPreapproval).mock.invocationCallOrder[0]);
    expect(d.reportOrphanCheckout).not.toHaveBeenCalled();
  });

  it("still answers the conflict and reports the checkout for a manual cancel when the cancel fails", async () => {
    const p = provider(); p.cancelPreapproval = vi.fn(async () => { throw new Error("Mercado Pago preapproval cancel failed (500)"); });
    const d = deps({ provider: p, linkAttempt: conflict(), reportOrphanCheckout: vi.fn() });
    const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: false, code: "RETRY_SUBSCRIPTION_CONFLICT", message: expect.any(String) });
    expect(d.finishAttempt).toHaveBeenCalledWith({ attemptId: "attempt_retry", status: "failed", providerPreapprovalId: "mp_new" });
    expect(d.reportOrphanCheckout).toHaveBeenCalledWith({ businessId: "biz_1", mpPreapprovalId: "mp_new" });
  });
});

describe("retryPendingUpgrade checkout limits", () => {
  it("refuses without reserving an attempt or calling Mercado Pago when the negócio's rate limit is exhausted", async () => {
    const d = deps({ checkoutLimits: { countPendingCheckouts: vi.fn(async () => 1), consumeCheckout: vi.fn(async () => false) } });
    const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: false, code: "CHECKOUT_RATE_LIMITED", message: "Muitas tentativas de pagamento em pouco tempo. Aguarde alguns minutos e tente novamente." });
    expect(d.claimAttempt).not.toHaveBeenCalled();
    expect(d.provider.createPreapproval).not.toHaveBeenCalled();
  });

  it("refuses a sixth pending checkout without spending the rate limit", async () => {
    const consumeCheckout = vi.fn(async () => true);
    const d = deps({ checkoutLimits: { countPendingCheckouts: vi.fn(async () => 5), consumeCheckout } });
    const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: false, code: "TOO_MANY_PENDING_CHECKOUTS", message: expect.stringContaining("fale com o suporte") });
    expect(consumeCheckout).not.toHaveBeenCalled();
    expect(d.claimAttempt).not.toHaveBeenCalled();
    expect(d.provider.createPreapproval).not.toHaveBeenCalled();
  });

  it("refuses when the limits cannot be checked", async () => {
    const d = deps({ checkoutLimits: { countPendingCheckouts: vi.fn(async () => { throw new Error("database unavailable"); }), consumeCheckout: vi.fn(async () => true) } });
    const result = await retryPendingUpgrade(d);
    expect(result).toEqual({ ok: false, code: "CHECKOUT_LIMIT_UNAVAILABLE", message: expect.any(String) });
    expect(d.claimAttempt).not.toHaveBeenCalled();
    expect(d.provider.createPreapproval).not.toHaveBeenCalled();
  });
});

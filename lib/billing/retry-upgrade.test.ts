import { describe, expect, it, vi } from "vitest";
import { retryPendingUpgrade, type RetryUpgradeDeps } from "./retry-upgrade";
import { MercadoPagoAmbiguousError } from "./mercado-pago";
import type { BillingProvider } from "./provider";

const existing = { subscriptionId: "sub_old", mpPreapprovalId: "mp_old", status: "pending" as const, plan: "pro" as const, currentPeriodStart: null, currentPeriodEnd: null };
function provider(): BillingProvider { return { createPreapproval: vi.fn(async () => ({ preapprovalId: "mp_new", initPoint: "https://mp.example/new" })), getPreapproval: vi.fn(), cancelPreapproval: vi.fn(async () => undefined) }; }
function deps(overrides: Partial<RetryUpgradeDeps> = {}): RetryUpgradeDeps {
  return {
    business: { id: "biz_1" }, provider: provider(), fetchSubscription: vi.fn(async () => existing),
    claimAttempt: vi.fn(async () => ({ id: "attempt_retry", businessId: "biz_1", kind: "retry" as const, status: "reserved" as const, idempotencyKey: "key", providerPreapprovalId: null })),
    startRetry: vi.fn(async () => ({ id: "attempt_retry", businessId: "biz_1", kind: "retry" as const, status: "creating" as const, idempotencyKey: "key", providerPreapprovalId: null })),
    finishAttempt: vi.fn(async () => ({ id: "attempt_retry", businessId: "biz_1", kind: "retry" as const, status: "unknown" as const, idempotencyKey: "key", providerPreapprovalId: "mp_new" })),
    linkAttempt: vi.fn(async () => undefined), backUrl: "https://app.example", idempotencyKey: "key",
    checkoutLimits: { countPendingCheckouts: vi.fn(async () => 1), consumeCheckout: vi.fn(async () => true) },
    ...overrides,
  };
}

describe("retryPendingUpgrade with billing_attempts", () => {
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

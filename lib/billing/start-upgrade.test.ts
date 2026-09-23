import { describe, expect, it, vi } from "vitest";
import { startUpgrade, type StartUpgradeDeps } from "./start-upgrade";
import { MercadoPagoAmbiguousError } from "./mercado-pago";
import type { BillingProvider, CreatePreapprovalResult } from "./provider";

const BUSINESS = { id: "biz_1", plan: "free" as const };

function makeProvider(result: CreatePreapprovalResult): BillingProvider {
  return { createPreapproval: vi.fn(async () => result), getPreapproval: vi.fn(), cancelPreapproval: vi.fn() };
}

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt_1",
    businessId: "biz_1",
    kind: "initial" as const,
    status: "reserved" as const,
    idempotencyKey: "key_1",
    providerPreapprovalId: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<StartUpgradeDeps> = {}): StartUpgradeDeps {
  const provider = makeProvider({ preapprovalId: "mp_123", initPoint: "https://mp.example/checkout" });
  return {
    business: BUSINESS,
    provider,
    claimAttempt: vi.fn(async () => makeAttempt()),
    startAttempt: vi.fn(async () => makeAttempt({ status: "creating" })),
    finishAttempt: vi.fn(async (input: { status: "failed" | "unknown" }) => makeAttempt({ status: input.status })),
    linkAttempt: vi.fn(async () => undefined),
    backUrl: "https://app.example/dashboard/configuracoes",
    payerEmail: "owner@example.com",
    idempotencyKey: "key_1",
    ...overrides,
  };
}

describe("startUpgrade with billing_attempts", () => {
  it("claims, starts, creates, links, and returns the checkout", async () => {
    const deps = makeDeps();
    const result = await startUpgrade(deps);
    expect(result).toEqual({ ok: true, initPoint: "https://mp.example/checkout" });
    expect(deps.claimAttempt).toHaveBeenCalledWith({ businessId: "biz_1", kind: "initial", idempotencyKey: "key_1" });
    expect(deps.startAttempt).toHaveBeenCalledWith("attempt_1", "key_1");
    expect(deps.provider.createPreapproval).toHaveBeenCalledTimes(1);
    expect(deps.linkAttempt).toHaveBeenCalledWith({ attemptId: "attempt_1", mpPreapprovalId: "mp_123" });
  });

  it("does not create when another active attempt won the claim", async () => {
    const deps = makeDeps({ claimAttempt: vi.fn(async () => makeAttempt({ idempotencyKey: "other-key" })) });
    const result = await startUpgrade(deps);
    expect(result).toEqual({ ok: false, code: "UPGRADE_IN_PROGRESS", message: expect.any(String) });
    expect(deps.provider.createPreapproval).not.toHaveBeenCalled();
  });

  it.each(["unknown", "ambiguous"] as const)("does not create while attempt is %s", async (status) => {
    const deps = makeDeps({ claimAttempt: vi.fn(async () => makeAttempt({ status })) });
    const result = await startUpgrade(deps);
    expect(result).toEqual({ ok: false, code: "UPGRADE_RECONCILIATION_REQUIRED", message: expect.any(String) });
    expect(deps.provider.createPreapproval).not.toHaveBeenCalled();
  });

  it("marks a clearly rejected provider request failed", async () => {
    const provider = {
      createPreapproval: vi.fn(async () => { throw new Error("Mercado Pago preapproval failed (400)"); }),
      getPreapproval: vi.fn(), cancelPreapproval: vi.fn(),
    } satisfies BillingProvider;
    const deps = makeDeps({ provider });
    const result = await startUpgrade(deps);
    expect(result).toEqual({ ok: false, code: "PROVIDER_ERROR", message: expect.any(String) });
    expect(deps.finishAttempt).toHaveBeenCalledWith({ attemptId: "attempt_1", status: "failed" });
  });

  it("marks an ambiguous provider response unknown", async () => {
    const provider = {
      createPreapproval: vi.fn(async () => { throw new MercadoPagoAmbiguousError("timeout"); }),
      getPreapproval: vi.fn(), cancelPreapproval: vi.fn(),
    } satisfies BillingProvider;
    const deps = makeDeps({ provider });
    const result = await startUpgrade(deps);
    expect(result).toEqual({ ok: false, code: "PROVIDER_UNKNOWN", message: "Não foi possível iniciar a assinatura. Tente novamente." });
    expect(JSON.stringify(result)).not.toContain("timeout");
    expect(deps.finishAttempt).toHaveBeenCalledWith({ attemptId: "attempt_1", status: "unknown" });
    expect(deps.linkAttempt).not.toHaveBeenCalled();
  });

  it("marks local linking failure unknown and never returns a checkout", async () => {
    const deps = makeDeps({ linkAttempt: vi.fn(async () => { throw new Error("database unavailable"); }) });
    const result = await startUpgrade(deps);
    expect(result).toEqual({ ok: false, code: "SAVE_UNKNOWN", message: "A operação de pagamento precisa de verificação. Tente novamente mais tarde." });
    expect(JSON.stringify(result)).not.toContain("database unavailable");
    expect(deps.finishAttempt).toHaveBeenCalledWith({ attemptId: "attempt_1", status: "unknown", providerPreapprovalId: "mp_123" });
  });

  it("preserves the existing Pro/pending product rule", async () => {
    const provider = makeProvider({ preapprovalId: "mp_ignored", initPoint: "https://mp.example/ignored" });
    const result = await startUpgrade({
      business: { id: "biz_1", plan: "pro" }, provider,
      claimAttempt: vi.fn(), startAttempt: vi.fn(), finishAttempt: vi.fn(), linkAttempt: vi.fn(),
      fetchSubscription: vi.fn(async () => ({ mpPreapprovalId: "mp_pending", status: "pending" as const, plan: "pro" as const, currentPeriodStart: null, currentPeriodEnd: null })),
      backUrl: "https://app.example",
    });
    expect(result).toEqual({ ok: false, code: "ALREADY_PRO", message: expect.any(String) });
    expect(provider.createPreapproval).not.toHaveBeenCalled();
  });
});

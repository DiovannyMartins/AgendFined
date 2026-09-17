import { describe, expect, it, vi } from "vitest";
import { reconcileBilling, type BillingReconciliationDependencies, type ReconciliationAttempt } from "./reconciliation";
import type { Preapproval } from "./provider";

const snapshot: Preapproval = { id: "mp_1", status: "authorized", externalReference: "attempt_1", currentPeriodStart: null, currentPeriodEnd: null };
const attempt = (overrides: Partial<ReconciliationAttempt> = {}): ReconciliationAttempt => ({
  id: "attempt_1", businessId: "biz_1", status: "unknown", providerPreapprovalId: "mp_1", expectedSubscriptionId: null,
  updatedAt: new Date().toISOString(), ...overrides,
});

function deps(overrides: Partial<BillingReconciliationDependencies> = {}): BillingReconciliationDependencies {
  return {
    provider: { createPreapproval: vi.fn(), getPreapproval: vi.fn(async () => snapshot), cancelPreapproval: vi.fn() },
    attempts: [attempt()], subscriptions: [], businesses: [{ id: "biz_1", currentSubscriptionId: null, plan: "free" }],
    claim: vi.fn(async () => true), release: vi.fn(async () => undefined),
    markAttempt: vi.fn(async () => undefined), reconcileAttempt: vi.fn(async () => undefined),
    applySnapshot: vi.fn(async () => undefined), report: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("billing reconciliation fencing and correlation", () => {
  it("requires a valid claim before the final operation and propagates its token", async () => {
    const d = deps(); await reconcileBilling(d);
    expect(d.claim).toHaveBeenCalledTimes(2);
    expect(d.reconcileAttempt).toHaveBeenCalledWith(expect.anything(), snapshot, expect.any(String));
  });

  it("does not finalize when the lease is lost after HTTP and continues the batch", async () => {
    const claim = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const d = deps({ claim });
    await expect(reconcileBilling(d)).resolves.toEqual([expect.objectContaining({ detail: "CLAIM_LOST" })]);
    expect(d.reconcileAttempt).not.toHaveBeenCalled();
  });

  it("processes oldest candidates first and respects the batch limit", async () => {
    const attempts = [
      attempt({ id: "attempt_1", updatedAt: "2026-01-03T00:00:00Z" }),
      attempt({ id: "attempt_1", updatedAt: "2026-01-01T00:00:00Z" }),
    ];
    const d = deps({ attempts, maxAttempts: 1 });
    await reconcileBilling(d);
    expect(d.reconcileAttempt).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.reconcileAttempt).mock.calls[0][0].id).toBe("attempt_1");
  });

  it("continues with the next attempt after an isolated failure", async () => {
    const d = deps({
      attempts: [attempt({ id: "one", providerPreapprovalId: "mp_one" }), attempt({ id: "two", providerPreapprovalId: "mp_two" })],
      provider: {
        createPreapproval: vi.fn(), cancelPreapproval: vi.fn(),
        getPreapproval: vi.fn(async id => ({ ...snapshot, id, externalReference: id.replace("mp_", "") })),
      },
      reconcileAttempt: vi.fn().mockRejectedValueOnce(new Error("one failed")).mockResolvedValueOnce(undefined),
    });
    await expect(reconcileBilling(d)).resolves.toHaveLength(0);
    expect(d.reconcileAttempt).toHaveBeenCalledTimes(2);
  });

  it("does not treat a provider search error as zero matches", async () => {
    const report = vi.fn(async () => undefined);
    const d = deps({ attempts: [attempt({ providerPreapprovalId: null })], report,
      provider: { createPreapproval: vi.fn(), getPreapproval: vi.fn(), cancelPreapproval: vi.fn(), searchPreapprovals: vi.fn(async () => { throw new Error("temporary MP error"); }) } });
    await reconcileBilling(d);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ kind: "provider_error" }));
    expect(d.reconcileAttempt).not.toHaveBeenCalled();
  });

  it("keeps an attempt ambiguous when search is unavailable", async () => {
    const d = deps({ attempts: [attempt({ providerPreapprovalId: null })] }); await reconcileBilling(d);
    expect(d.markAttempt).toHaveBeenCalledWith("attempt_1", "ambiguous", undefined, "unknown", expect.any(String));
  });

  it("rejects an incompatible external reference", async () => {
    const d = deps({ provider: { createPreapproval: vi.fn(), getPreapproval: vi.fn(async () => ({ ...snapshot, externalReference: "other" })), cancelPreapproval: vi.fn() } });
    await reconcileBilling(d);
    expect(d.markAttempt).toHaveBeenCalledWith("attempt_1", "ambiguous", "mp_1", "unknown", expect.any(String));
    expect(d.reconcileAttempt).not.toHaveBeenCalled();
  });

  it("allows an absent external reference when the provider id is known", async () => {
    const d = deps({ provider: { createPreapproval: vi.fn(), getPreapproval: vi.fn(async () => ({ ...snapshot, externalReference: null })), cancelPreapproval: vi.fn() } });
    await reconcileBilling(d); expect(d.reconcileAttempt).toHaveBeenCalledTimes(1);
  });

  it("reports duplicate provider links without finalizing", async () => {
    const s = { id: "s", businessId: "biz_1", mpPreapprovalId: "mp_1", status: "pending" as const };
    const reconcileAttempt = vi.fn(async () => undefined);
    const applySnapshot = vi.fn(async () => undefined);
    const d = deps({ subscriptions: [s, { ...s, id: "s2" }], reconcileAttempt, applySnapshot });
    await reconcileBilling(d);
    expect(d.report).toHaveBeenCalledWith(expect.objectContaining({ kind: "duplicate_provider_link" }));
    expect(reconcileAttempt).not.toHaveBeenCalled();
    expect(applySnapshot).not.toHaveBeenCalled();
    expect(d.provider.createPreapproval).not.toHaveBeenCalled();
    expect(d.provider.cancelPreapproval).not.toHaveBeenCalled();
  });

  it("does not promote a historical subscription without an expected current", async () => {
    const d = deps({ subscriptions: [{ id: "s", businessId: "biz_1", mpPreapprovalId: "mp_1", status: "pending" }] });
    await reconcileBilling(d); expect(d.reconcileAttempt).toHaveBeenCalledTimes(1);
  });

  it("is safe to rerun after the provider snapshot is already linked", async () => {
    const d = deps({ attempts: [attempt({ status: "linked" })] }); await reconcileBilling(d); expect(d.reconcileAttempt).not.toHaveBeenCalled();
  });
});

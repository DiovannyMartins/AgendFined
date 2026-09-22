import { describe, expect, it, vi } from "vitest";
import type { BillingSubscription } from "./types";
import type { AppliedSubscriptionSnapshot, ApplySubscriptionSnapshotInput } from "./handle-webhook";
import { syncReturnedSubscription } from "./return-sync";

describe("syncReturnedSubscription", () => {
  it("aplica o status autorizado confirmado pelo provedor no retorno do checkout", async () => {
    const current: BillingSubscription = {
      subscriptionId: "sub_1",
      mpPreapprovalId: "mp_1",
      status: "pending",
      plan: "pro",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    };
    const applySnapshot = vi.fn(async (input: ApplySubscriptionSnapshotInput): Promise<AppliedSubscriptionSnapshot> => ({
      subscriptionId: input.subscriptionId,
      businessId: input.businessId,
      subscriptionStatus: input.status,
      isCurrent: true,
      effectivePlan: input.status === "authorized" ? ("pro" as const) : ("free" as const),
      effectiveGracePeriodEnd: null,
    }));

    const result = await syncReturnedSubscription("biz_1", {
      fetchSubscription: vi.fn(async () => current),
      getPreapproval: vi.fn(async () => ({
        id: "mp_1",
        status: "authorized" as const,
        externalReference: "attempt_1",
        currentPeriodStart: "2026-09-21T00:00:00.000Z",
        currentPeriodEnd: "2026-10-21T00:00:00.000Z",
      })),
      applySnapshot,
    });

    expect(result).toEqual({ ok: true, status: "authorized", effectivePlan: "pro" });
    expect(applySnapshot).toHaveBeenCalledWith({
      businessId: "biz_1",
      subscriptionId: "sub_1",
      mpPreapprovalId: "mp_1",
      status: "authorized",
      currentPeriodStart: "2026-09-21T00:00:00.000Z",
      currentPeriodEnd: "2026-10-21T00:00:00.000Z",
      gracePeriodEnd: null,
    });
  });
});

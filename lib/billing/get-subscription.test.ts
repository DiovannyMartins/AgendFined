import { describe, expect, it, vi } from "vitest";
import { getSubscription, type FetchSubscription } from "./get-subscription";
import type { BillingSubscription } from "./types";

describe("getSubscription (ADR 0008)", () => {
  it("returns the business plan and null when there is no subscription", async () => {
    const fetchSubscription: FetchSubscription = vi.fn(async () => null);

    const result = await getSubscription({ id: "biz_1", plan: "free" }, { fetchSubscription });

    expect(result).toEqual({ plan: "free", subscription: null, graceSubscription: null });
    expect(fetchSubscription).toHaveBeenCalledWith("biz_1");
  });

  it("returns the latest subscription row mapped to camelCase", async () => {
    const subscription: BillingSubscription = {
      mpPreapprovalId: "mp_42",
      status: "authorized",
      plan: "pro",
      currentPeriodStart: "2099-01-01T00:00:00.000Z",
      currentPeriodEnd: "2099-02-01T00:00:00.000Z",
    };
    const fetchSubscription: FetchSubscription = vi.fn(async () => subscription);

    const result = await getSubscription({ id: "biz_1", plan: "pro" }, { fetchSubscription });

    expect(result.plan).toBe("pro");
    expect(result.subscription).toEqual(subscription);
    expect(result.graceSubscription).toBeNull();
  });

  it("surfaces the plan regardless of the subscription state", async () => {
    const fetchSubscription: FetchSubscription = vi.fn(async () => null);

    const result = await getSubscription({ id: "biz_1", plan: "pro" }, { fetchSubscription });

    expect(result.plan).toBe("pro");
    expect(result.subscription).toBeNull();
    expect(result.graceSubscription).toBeNull();
  });

  it("exposes the active grace when the current row is pending on a pro business", async () => {
    const pending: BillingSubscription = {
      mpPreapprovalId: "mp_pending",
      status: "pending",
      plan: "pro",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    };
    const grace: BillingSubscription = {
      mpPreapprovalId: "mp_cancelled",
      status: "cancelled",
      plan: "pro",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: "2099-01-08T00:00:00.000Z",
    };
    const fetchSubscription: FetchSubscription = vi.fn(async () => pending);
    const fetchGraceSubscription = vi.fn(async () => grace);

    const result = await getSubscription(
      { id: "biz_1", plan: "pro" },
      {
        fetchSubscription,
        fetchGraceSubscription,
        now: () => new Date("2099-01-01T00:00:00.000Z"),
      },
    );

    expect(result.subscription?.status).toBe("pending");
    expect(result.graceSubscription).toEqual(grace);
  });

  it("ignores an expired grace when the current row is pending", async () => {
    const pending: BillingSubscription = {
      mpPreapprovalId: "mp_pending",
      status: "pending",
      plan: "pro",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    };
    const expired: BillingSubscription = {
      mpPreapprovalId: "mp_cancelled",
      status: "cancelled",
      plan: "pro",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: "2099-01-01T00:00:00.000Z",
    };
    const result = await getSubscription(
      { id: "biz_1", plan: "pro" },
      {
        fetchSubscription: vi.fn(async () => pending),
        fetchGraceSubscription: vi.fn(async () => expired),
        now: () => new Date("2099-02-01T00:00:00.000Z"),
      },
    );

    expect(result.graceSubscription).toBeNull();
  });

  it("does not fetch grace for a plain pending on a free business", async () => {
    const pending: BillingSubscription = {
      mpPreapprovalId: "mp_pending",
      status: "pending",
      plan: "pro",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    };
    const fetchGraceSubscription = vi.fn(async () => null);

    const result = await getSubscription(
      { id: "biz_1", plan: "free" },
      { fetchSubscription: vi.fn(async () => pending), fetchGraceSubscription },
    );

    expect(result.graceSubscription).toBeNull();
    expect(fetchGraceSubscription).not.toHaveBeenCalled();
  });
});

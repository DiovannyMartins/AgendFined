import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentSubscription, getSubscription, type FetchSubscription } from "./get-subscription";
import type { BillingSubscription } from "./types";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("getSubscription (ADR 0008)", () => {
  it("reads the subscription referenced by the business current pointer", async () => {
    const from = vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => table === "businesses"
          ? { data: { current_subscription_id: "sub_current" }, error: null }
          : {
              data: {
                id: "sub_current",
                mp_preapproval_id: "mp_current",
                status: "pending",
                current_period_start: null,
                current_period_end: null,
                grace_period_end: null,
              },
              error: null,
            }),
      };
      return query;
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    await expect(fetchCurrentSubscription("biz_1")).resolves.toMatchObject({
      subscriptionId: "sub_current",
      mpPreapprovalId: "mp_current",
      status: "pending",
    });
    expect(from).toHaveBeenNthCalledWith(1, "businesses");
    expect(from).toHaveBeenNthCalledWith(2, "subscriptions");
  });

  it("returns null when there is no subscription", async () => {
    const fetchSubscription: FetchSubscription = vi.fn(async () => null);

    const result = await getSubscription({ id: "biz_1" }, { fetchSubscription });

    expect(result).toEqual({ subscription: null, graceSubscription: null });
    expect(fetchSubscription).toHaveBeenCalledWith("biz_1", undefined);
  });

  it("returns the latest subscription row mapped to camelCase", async () => {
    const subscription: BillingSubscription = {
      mpPreapprovalId: "mp_42",
      status: "authorized",
      currentPeriodStart: "2099-01-01T00:00:00.000Z",
      currentPeriodEnd: "2099-02-01T00:00:00.000Z",
    };
    const fetchSubscription: FetchSubscription = vi.fn(async () => subscription);

    const result = await getSubscription({ id: "biz_1" }, { fetchSubscription });
    expect(result.subscription).toEqual(subscription);
    expect(result.graceSubscription).toBeNull();
  });

  it("exposes the active grace when the current row is pending", async () => {
    const pending: BillingSubscription = {
      mpPreapprovalId: "mp_pending",
      status: "pending",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    };
    const grace: BillingSubscription = {
      mpPreapprovalId: "mp_cancelled",
      status: "cancelled",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: "2099-01-08T00:00:00.000Z",
    };
    const fetchSubscription: FetchSubscription = vi.fn(async () => pending);
    const fetchGraceSubscription = vi.fn(async () => grace);

    const result = await getSubscription(
      { id: "biz_1" },
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
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    };
    const expired: BillingSubscription = {
      mpPreapprovalId: "mp_cancelled",
      status: "cancelled",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: "2099-01-01T00:00:00.000Z",
    };
    const result = await getSubscription(
      { id: "biz_1" },
      {
        fetchSubscription: vi.fn(async () => pending),
        fetchGraceSubscription: vi.fn(async () => expired),
        now: () => new Date("2099-02-01T00:00:00.000Z"),
      },
    );

    expect(result.graceSubscription).toBeNull();
  });

  it("finds no grace for a plain pending checkout", async () => {
    const pending: BillingSubscription = {
      mpPreapprovalId: "mp_pending",
      status: "pending",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    };
    const fetchGraceSubscription = vi.fn(async () => null);

    const result = await getSubscription(
      { id: "biz_1" },
      { fetchSubscription: vi.fn(async () => pending), fetchGraceSubscription },
    );

    expect(result.graceSubscription).toBeNull();
    expect(fetchGraceSubscription).toHaveBeenCalledWith("biz_1");
  });
});

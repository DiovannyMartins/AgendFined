import { describe, expect, it, vi } from "vitest";
import {
  buildWaitlistManagementResult,
  type FetchWaitlistEntries,
  type ManageWaitlistEntry,
  type WaitlistManagementBusiness,
} from "@/lib/waitlist/manage";

const entry: ManageWaitlistEntry = {
  id: "w1",
  business_id: "biz-active",
  service_id: "svc-1",
  service_name: "Corte",
  start_at: "2099-01-05T14:00:00.000Z",
  customer_name: "Maria",
  customer_phone: "+5511988888888",
  customer_email: "a@b.com",
  status: "pending",
  created_at: "2099-01-01T10:00:00.000Z",
};

const activeBusiness: WaitlistManagementBusiness = { id: "biz-active", has_access: true };
const suspendedBusiness: WaitlistManagementBusiness = { id: "biz-suspended", has_access: false };
const unknownAccessBusiness: WaitlistManagementBusiness = { id: "biz-unknown", has_access: null };

describe("buildWaitlistManagementResult (access gate, ADR 0013 / issue #22)", () => {
  it("returns no_business when there is no business", async () => {
    const result = await buildWaitlistManagementResult(null, async () => []);
    expect(result).toEqual({ status: "no_business" });
  });

  it("returns access_required for a suspended business without fetching entries", async () => {
    const spy = vi.fn<FetchWaitlistEntries>(async () => []);
    const result = await buildWaitlistManagementResult(suspendedBusiness, spy);
    expect(result).toEqual({ status: "access_required" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed for a business with an unknown access", async () => {
    const result = await buildWaitlistManagementResult(unknownAccessBusiness, async () => []);
    expect(result).toEqual({ status: "access_required" });
  });

  it("returns ok with the entries for a business with access", async () => {
    const result = await buildWaitlistManagementResult(activeBusiness, async () => [entry]);
    expect(result).toEqual({ status: "ok", entries: [entry] });
  });

  it("returns error when the entries fetch throws", async () => {
    const failing: FetchWaitlistEntries = async () => {
      throw new Error("boom");
    };
    const result = await buildWaitlistManagementResult(activeBusiness, failing);
    expect(result).toEqual({ status: "error" });
  });
});

import { describe, expect, it } from "vitest";
import { publicAvailabilitySchema } from "@/lib/validation/schemas";
import { DEMO_BUSINESS_ID, DEMO_SERVICE_IDS } from "./seed-demo-ids.mjs";

describe("demo seed IDs", () => {
  it.each(DEMO_SERVICE_IDS)("pass the public availability schema for service %s", (serviceId) => {
    const result = publicAvailabilitySchema.safeParse({ businessId: DEMO_BUSINESS_ID, serviceId, date: "2026-10-20" });
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("are distinct", () => {
    expect(new Set([DEMO_BUSINESS_ID, ...DEMO_SERVICE_IDS]).size).toBe(DEMO_SERVICE_IDS.length + 1);
  });
});

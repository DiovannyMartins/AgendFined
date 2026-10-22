import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> | null;
type Result = { data: Row; error: { message: string } | null };

const { state } = vi.hoisted(() => ({
  state: { business: { data: null, error: null } as Result, service: { data: null, error: null } as Result },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: vi.fn() }));
vi.mock("@/lib/booking/rate-limit", () => ({
  getClientIp: async () => "203.0.113.7",
  enforceAvailabilityRateLimit: async () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // Like PostgREST, maybeSingle answers a missing row with data: null and no
      // error; single() would report it as an error instead.
      const result = table === "businesses" ? state.business : state.service;
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result,
        single: async () => (result.data ? result : { data: null, error: { message: "PGRST116" } }),
      };
      return query;
    },
  }),
}));

import { getSlotsForDate } from "./actions";

const BUSINESS_ID = "3f2b8c1e-5d4a-4b7e-9c2f-1a2b3c4d5e6f";
const SERVICE_ID = "8f14e45f-ceea-467f-a8c8-2a1a0c6e3f4b";
const business = {
  id: BUSINESS_ID,
  is_active: true,
  slot_interval_minutes: 30,
  min_notice_minutes: 0,
  booking_window_days: 60,
  plan: "free",
  timezone: "America/Sao_Paulo",
};

describe("getSlotsForDate", () => {
  beforeEach(() => {
    state.business = { data: business, error: null };
    state.service = { data: null, error: null };
  });

  it("reports a serviço turned off with the page open as service_not_found, not a db error", async () => {
    expect(await getSlotsForDate(BUSINESS_ID, SERVICE_ID, "2026-10-20")).toEqual({
      available: [],
      error: "service_not_found",
    });
  });

  it("reports a missing negócio as not_found", async () => {
    state.business = { data: null, error: null };

    expect(await getSlotsForDate(BUSINESS_ID, SERVICE_ID, "2026-10-20")).toEqual({ available: [], error: "not_found" });
  });

  it("keeps db_error for a real database failure", async () => {
    state.service = { data: null, error: { message: "connection reset" } };

    expect(await getSlotsForDate(BUSINESS_ID, SERVICE_ID, "2026-10-20")).toEqual({ available: [], error: "db_error" });
  });
});

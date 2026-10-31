import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { message: string } | null };

const { state } = vi.hoisted(() => ({
  state: {
    allowed: true as boolean | Error,
    business: { data: null, error: null } as Result,
    service: { data: null, error: null } as Result,
    faixas: { data: [], error: null } as Result,
    blocks: { data: [], error: null } as Result,
    bookings: { data: [], error: null } as Result,
    queried: [] as string[],
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceAvailabilityRateLimit: async () => {
    if (state.allowed instanceof Error) throw state.allowed;
    return state.allowed;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      state.queried.push(table);
      // Like PostgREST, maybeSingle answers a missing row with data: null and no error.
      const result =
        table === "businesses" ? state.business
        : table === "services" ? state.service
        : table === "availability" ? state.faixas
        : table === "availability_blocks" ? state.blocks
        : state.bookings;
      const query = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        lt: () => query,
        gt: () => query,
        maybeSingle: async () => result,
        then: (resolve: (r: Result) => unknown) => resolve(result),
      };
      return query;
    },
  }),
}));

import { getPublicSlots } from "./public-slots";

const BUSINESS_ID = "3f2b8c1e-5d4a-4b7e-9c2f-1a2b3c4d5e6f";
const SERVICE_ID = "8f14e45f-ceea-467f-a8c8-2a1a0c6e3f4b";
const DATE = "2026-11-03"; // a Tuesday: weekday 3 (1=Sun)
const input = { businessId: BUSINESS_ID, serviceId: SERVICE_ID, date: DATE };
const business = {
  id: BUSINESS_ID,
  is_active: true,
  slot_interval_minutes: 60,
  min_notice_minutes: 0,
  booking_window_days: 60,
  plan: "free",
  timezone: "America/Sao_Paulo",
};

describe("getPublicSlots", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-30T12:00:00Z") });
    state.allowed = true;
    state.business = { data: business, error: null };
    state.service = { data: { duration_minutes: 60 }, error: null };
    state.faixas = {
      data: [
        { weekday: 3, start_time: "09:00", end_time: "11:00" },
        { weekday: 4, start_time: "14:00", end_time: "16:00" },
      ],
      error: null,
    };
    state.blocks = { data: [], error: null };
    state.bookings = { data: [], error: null };
    state.queried = [];
  });

  it("answers only the free slots of the requested weekday", async () => {
    expect(await getPublicSlots(input, "203.0.113.7")).toEqual({ available: ["09:00", "10:00"] });
  });

  it("refuses invalid input before touching the database", async () => {
    expect(await getPublicSlots({ ...input, date: "amanhã" }, "203.0.113.7")).toEqual({
      available: [],
      error: "validation",
    });
    expect(state.queried).toEqual([]);
  });

  it("answers rate_limited when over the limit and fails closed when the limiter fails", async () => {
    state.allowed = false;
    expect(await getPublicSlots(input, "203.0.113.7")).toEqual({ available: [], error: "rate_limited" });

    state.allowed = new Error("boom");
    expect(await getPublicSlots(input, "203.0.113.7")).toEqual({ available: [], error: "rate_limited" });
    expect(state.queried).toEqual([]);
  });

  it("reports a serviço turned off with the page open as service_not_found, not a db error", async () => {
    state.service = { data: null, error: null };
    expect(await getPublicSlots(input, "203.0.113.7")).toEqual({ available: [], error: "service_not_found" });
  });

  it("reports a missing negócio as not_found", async () => {
    state.business = { data: null, error: null };
    expect(await getPublicSlots(input, "203.0.113.7")).toEqual({ available: [], error: "not_found" });
  });

  it("keeps db_error for a real database failure", async () => {
    state.service = { data: null, error: { message: "connection reset" } };
    expect(await getPublicSlots(input, "203.0.113.7")).toEqual({ available: [], error: "db_error" });

    state.service = { data: { duration_minutes: 60 }, error: null };
    state.faixas = { data: null, error: { message: "connection reset" } };
    expect(await getPublicSlots(input, "203.0.113.7")).toEqual({ available: [], error: "db_error" });
  });

  it("answers booking_window for a date past the janela", async () => {
    expect(await getPublicSlots({ ...input, date: "2027-03-01" }, "203.0.113.7")).toEqual({
      available: [],
      error: "booking_window",
    });
  });
});

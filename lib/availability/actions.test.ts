import { beforeEach, describe, expect, it, vi } from "vitest";

type Filter = [op: string, column: string, value: unknown];

const { state } = vi.hoisted(() => ({
  state: {
    business: { id: "business-1", timezone: "America/Sao_Paulo" } as { id: string; timezone: string } | null,
    bookings: [] as { id: string; customer_name_snapshot: string; start_at: string; end_at: string }[],
    bookingFilters: [] as Filter[],
    inserts: [] as Record<string, unknown>[],
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: async () => state.business }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "availability_blocks") {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.inserts.push(row);
            return { error: null };
          },
        };
      }
      // bookings conflict query: chainable filters, awaited at the end.
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (state.bookingFilters.push(["eq", column, value]), query),
        neq: (column: string, value: unknown) => (state.bookingFilters.push(["neq", column, value]), query),
        gt: (column: string, value: unknown) => (state.bookingFilters.push(["gt", column, value]), query),
        lt: (column: string, value: unknown) => (state.bookingFilters.push(["lt", column, value]), query),
        then: (resolve: (value: { data: typeof state.bookings }) => unknown) => {
          // Emulate Postgres half-open overlap using the instants the action sent.
          const gt = state.bookingFilters.find(([op, c]) => op === "gt" && c === "end_at")?.[2] as string;
          const lt = state.bookingFilters.find(([op, c]) => op === "lt" && c === "start_at")?.[2] as string;
          const data = state.bookings.filter(
            (b) => Date.parse(b.end_at) > Date.parse(gt) && Date.parse(b.start_at) < Date.parse(lt),
          );
          return Promise.resolve({ data }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

import { createBlock, setAvailability, updateAvailability } from "./actions";
import { computeAvailableSlots, toUtcRange } from "@/lib/booking/availability";

function blockForm(startAt: string, endAt: string, reason = "") {
  const formData = new FormData();
  formData.set("startAt", startAt);
  formData.set("endAt", endAt);
  formData.set("reason", reason);
  return formData;
}

describe("createBlock", () => {
  beforeEach(() => {
    state.business = { id: "business-1", timezone: "America/Sao_Paulo" };
    state.bookings = [];
    state.bookingFilters = [];
    state.inserts = [];
  });

  it("stores a datetime-local block as the UTC instant of the business wall clock (America/Sao_Paulo)", async () => {
    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-19T12:00", "2026-10-19T13:00", "Almoço"));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.inserts).toEqual([
      {
        business_id: "business-1",
        start_at: "2026-10-19T15:00:00.000Z",
        end_at: "2026-10-19T16:00:00.000Z",
        reason: "Almoço",
      },
    ]);
  });

  it("removes the 12:00 and 12:30 slots, not 09:00, for a 12:00–13:00 lunch block (#77)", async () => {
    await createBlock({ ok: true, data: undefined }, blockForm("2026-10-19T12:00", "2026-10-19T13:00"));
    const block = state.inserts[0] as { start_at: string; end_at: string };

    const slots = computeAvailableSlots({
      intervals: [{ startTime: "08:00", endTime: "18:00" }],
      rules: { slotIntervalMinutes: 30, minNoticeMinutes: 0, bookingWindowDays: 30, timezone: "America/Sao_Paulo" },
      durationMinutes: 30,
      date: "2026-10-19",
      now: new Date("2026-10-17T12:00:00Z"),
      blocks: [toUtcRange(block.start_at, block.end_at)],
      occupancies: [],
    });

    expect(slots).toContain("09:00");
    expect(slots).toContain("11:30");
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("12:30");
    expect(slots).toContain("13:00");
  });

  it("uses the business timezone, not a fixed one (America/Manaus)", async () => {
    state.business = { id: "business-1", timezone: "America/Manaus" };

    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-19T12:00", "2026-10-19T13:00"));

    expect(result.ok).toBe(true);
    expect(state.inserts[0]).toMatchObject({
      start_at: "2026-10-19T16:00:00.000Z",
      end_at: "2026-10-19T17:00:00.000Z",
      reason: null,
    });
  });

  it("checks booking conflicts with the same converted instants it inserts", async () => {
    await createBlock({ ok: true, data: undefined }, blockForm("2026-10-19T12:00", "2026-10-19T13:00"));

    expect(state.bookingFilters).toContainEqual(["gt", "end_at", "2026-10-19T15:00:00.000Z"]);
    expect(state.bookingFilters).toContainEqual(["lt", "start_at", "2026-10-19T16:00:00.000Z"]);
  });

  it("rejects a block over an existing booking at the same local time", async () => {
    // 12:30–13:00 in Brasília, stored in UTC as the booking RPC does.
    state.bookings = [
      { id: "booking-1", customer_name_snapshot: "Ana", start_at: "2026-10-19T15:30:00+00:00", end_at: "2026-10-19T16:00:00+00:00" },
    ];

    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-19T12:00", "2026-10-19T13:00"));

    expect(result).toMatchObject({ ok: false, code: "BOOKING_CONFLICT" });
    expect(state.inserts).toEqual([]);
  });

  it("rejects malformed datetimes without touching the database", async () => {
    const result = await createBlock({ ok: true, data: undefined }, blockForm("amanhã", "2026-10-19T13:00"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.inserts).toEqual([]);
    expect(state.bookingFilters).toEqual([]);
  });

  it("rejects an end that is not after the start", async () => {
    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-19T13:00", "2026-10-19T13:00"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.inserts).toEqual([]);
  });
});

describe("availability faixa validation", () => {
  function faixaForm(startTime: string, endTime: string) {
    const formData = new FormData();
    formData.set("weekday", "2");
    formData.set("startTime", startTime);
    formData.set("endTime", endTime);
    return formData;
  }

  it("explains an inverted faixa when adding it", async () => {
    const result = await setAvailability({ ok: true, data: undefined }, faixaForm("18:00", "08:00"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION", message: "O fim deve ser depois do início." });
  });

  it("explains an inverted faixa when editing it", async () => {
    const result = await updateAvailability("faixa-1", { ok: true, data: undefined }, faixaForm("18:00", "08:00"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION", message: "O fim deve ser depois do início." });
  });
});

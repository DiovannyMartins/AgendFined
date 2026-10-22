import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Filter = [op: string, column: string, value: unknown];

const { state } = vi.hoisted(() => ({
  state: {
    business: { id: "business-1", timezone: "America/Sao_Paulo" } as { id: string; timezone: string } | null,
    bookings: [] as { id: string; customer_name_snapshot: string; status: string; start_at: string; end_at: string }[],
    bookingFilters: [] as Filter[],
    bookingsError: null as { message: string } | null,
    inserts: [] as Record<string, unknown>[],
    faixas: [] as { id: string; weekday?: number; start_time: string; end_time: string }[],
    faixaWrites: [] as Record<string, unknown>[],
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
      if (table === "availability") {
        // Postgres returns time columns as "HH:MM:SS", unlike the form's "HH:MM".
        let excludedId: unknown;
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          neq: (_column: string, value: unknown) => ((excludedId = value), query),
          insert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => (
            state.faixaWrites.push(...(Array.isArray(rows) ? rows : [rows])), { error: null }
          ),
          update: (row: Record<string, unknown>) => (state.faixaWrites.push(row), query),
          then: (resolve: (value: { data: typeof state.faixas; error: null }) => unknown) =>
            Promise.resolve({
              data: state.faixas.filter((f) => f.id !== excludedId).map((f) => ({ weekday: 2, ...f })),
              error: null,
            }).then(resolve),
        };
        return query;
      }
      // bookings conflict query: chainable filters, awaited at the end.
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (state.bookingFilters.push(["eq", column, value]), query),
        neq: (column: string, value: unknown) => (state.bookingFilters.push(["neq", column, value]), query),
        gt: (column: string, value: unknown) => (state.bookingFilters.push(["gt", column, value]), query),
        lt: (column: string, value: unknown) => (state.bookingFilters.push(["lt", column, value]), query),
        then: (resolve: (value: { data: typeof state.bookings | null; error: { message: string } | null }) => unknown) => {
          if (state.bookingsError) return Promise.resolve({ data: null, error: state.bookingsError }).then(resolve);
          // Emulate Postgres with the filters and instants the action sent; every
          // fixture belongs to the current business.
          const data = state.bookings.filter((b) =>
            state.bookingFilters.every(([op, column, value]) => {
              if (column === "business_id") return true;
              const actual = b[column as keyof typeof b];
              if (op === "eq") return actual === value;
              if (op === "neq") return actual !== value;
              if (op === "gt") return Date.parse(actual) > Date.parse(value as string);
              if (op === "lt") return Date.parse(actual) < Date.parse(value as string);
              throw new Error(`unexpected filter ${op}`);
            }),
          );
          return Promise.resolve({ data, error: null }).then(resolve);
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
    state.business = { id: "business-1", timezone: "America/Sao_Paulo" };
    state.bookings = [];
    state.bookingFilters = [];
    state.bookingsError = null;
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
      { id: "booking-1", customer_name_snapshot: "Ana", status: "confirmed", start_at: "2026-10-19T15:30:00+00:00", end_at: "2026-10-19T16:00:00+00:00" },
    ];

    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-19T12:00", "2026-10-19T13:00"));

    expect(result).toMatchObject({ ok: false, code: "BOOKING_CONFLICT" });
    expect(state.inserts).toEqual([]);
  });

  // #143: "fechei o resto do dia" às 09:00 (12:00Z) com o bloqueio 08:00–18:00.
  it("accepts a block starting in the past over reservas that can no longer happen", async () => {
    state.bookings = [
      // 08:00–08:30, concluída.
      { id: "booking-1", customer_name_snapshot: "Rita", status: "completed", start_at: "2026-10-17T11:00:00Z", end_at: "2026-10-17T11:30:00Z" },
      // 08:30–09:00, ainda confirmada mas já terminou (o dono não marcou).
      { id: "booking-2", customer_name_snapshot: "Bia", status: "confirmed", start_at: "2026-10-17T11:30:00Z", end_at: "2026-10-17T12:00:00Z" },
      // 10:00–10:30, marcada como falta: estado terminal.
      { id: "booking-3", customer_name_snapshot: "Caio", status: "no_show", start_at: "2026-10-17T13:00:00Z", end_at: "2026-10-17T13:30:00Z" },
      { id: "booking-4", customer_name_snapshot: "Duda", status: "cancelled", start_at: "2026-10-17T14:00:00Z", end_at: "2026-10-17T14:30:00Z" },
    ];

    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-17T08:00", "2026-10-17T18:00"));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.inserts).toHaveLength(1);
  });

  it("still rejects a block starting in the past over a confirmed reserva ahead, citing its date and time", async () => {
    state.bookings = [
      { id: "booking-1", customer_name_snapshot: "Rita", status: "completed", start_at: "2026-10-17T11:00:00Z", end_at: "2026-10-17T11:30:00Z" },
      // 15:00–15:30 em Brasília.
      { id: "booking-2", customer_name_snapshot: "Ana", status: "confirmed", start_at: "2026-10-17T18:00:00Z", end_at: "2026-10-17T18:30:00Z" },
    ];

    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-17T08:00", "2026-10-17T18:00"));

    expect(result).toMatchObject({ ok: false, code: "BOOKING_CONFLICT" });
    if (result.ok) throw new Error("expected a conflict");
    expect(result.message).toContain("Ana (17/10/2026 às 15:00)");
    expect(result.message).not.toContain("Rita");
    expect(state.inserts).toEqual([]);
  });

  it("rejects a block over a confirmed reserva that is under way", async () => {
    // 08:45–09:15 em Brasília; agora são 09:00.
    state.bookings = [
      { id: "booking-1", customer_name_snapshot: "Ana", status: "confirmed", start_at: "2026-10-17T11:45:00Z", end_at: "2026-10-17T12:15:00Z" },
    ];

    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-17T08:00", "2026-10-17T18:00"));

    expect(result).toMatchObject({ ok: false, code: "BOOKING_CONFLICT" });
    expect(state.inserts).toEqual([]);
  });

  it("fails closed when the conflict check cannot be read", async () => {
    state.bookingsError = { message: "timeout" };

    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-19T12:00", "2026-10-19T13:00"));

    expect(result).toEqual({ ok: false, code: "DB_ERROR", message: "Não foi possível verificar conflitos. Tente novamente." });
    expect(state.inserts).toEqual([]);
  });

  it("rejects malformed datetimes without touching the database", async () => {
    const result = await createBlock({ ok: true, data: undefined }, blockForm("amanhã", "2026-10-19T13:00"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.inserts).toEqual([]);
    expect(state.bookingFilters).toEqual([]);
  });

  // #128: um bloqueio inteiramente no passado não bloqueia nada.
  it("rejects a block that already ended", async () => {
    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-16T12:00", "2026-10-16T13:00"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION", message: expect.stringContaining("já passou") });
    expect(state.inserts).toEqual([]);
  });

  it("accepts a block that is still under way", async () => {
    // 08:00–10:00 em Brasília = 11:00–13:00Z; agora são 12:00Z.
    const result = await createBlock({ ok: true, data: undefined }, blockForm("2026-10-17T08:00", "2026-10-17T10:00"));

    expect(result).toEqual({ ok: true, data: undefined });
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

  beforeEach(() => {
    state.business = { id: "business-1", timezone: "America/Sao_Paulo" };
    state.faixas = [];
    state.faixaWrites = [];
  });

  const morningAndAfternoon = [
    { id: "manha", start_time: "08:00:00", end_time: "12:00:00" },
    { id: "tarde", start_time: "14:00:00", end_time: "18:00:00" },
  ];

  it("adds a faixa touching the end of one and the start of another (#125)", async () => {
    state.faixas = morningAndAfternoon;

    const result = await setAvailability({ ok: true, data: undefined }, faixaForm("12:00", "14:00"));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.faixaWrites).toEqual([{ business_id: "business-1", weekday: 2, start_time: "12:00", end_time: "14:00" }]);
  });

  it("edits a faixa into the gap between two adjacent ones (#125)", async () => {
    state.faixas = [...morningAndAfternoon, { id: "almoco", start_time: "12:30:00", end_time: "13:30:00" }];

    const result = await updateAvailability("almoco", { ok: true, data: undefined }, faixaForm("12:00", "14:00"));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.faixaWrites).toEqual([{ weekday: 2, start_time: "12:00", end_time: "14:00" }]);
  });

  it("still rejects a faixa that really overlaps an existing one", async () => {
    state.faixas = morningAndAfternoon;

    const result = await setAvailability({ ok: true, data: undefined }, faixaForm("11:00", "15:00"));

    expect(result).toMatchObject({ ok: false, code: "OVERLAP" });
    expect(state.faixaWrites).toEqual([]);
  });

  it("explains an inverted faixa when adding it", async () => {
    const result = await setAvailability({ ok: true, data: undefined }, faixaForm("18:00", "08:00"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION", message: "O fim deve ser depois do início." });
  });

  it("explains an inverted faixa when editing it", async () => {
    const result = await updateAvailability("faixa-1", { ok: true, data: undefined }, faixaForm("18:00", "08:00"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION", message: "O fim deve ser depois do início." });
  });
});

describe("faixa em vários dias de uma vez (#149)", () => {
  function multiDayForm(weekdays: number[], startTime = "08:00", endTime = "18:00") {
    const formData = new FormData();
    for (const weekday of weekdays) formData.append("weekday", String(weekday));
    formData.set("startTime", startTime);
    formData.set("endTime", endTime);
    return formData;
  }

  beforeEach(() => {
    state.business = { id: "business-1", timezone: "America/Sao_Paulo" };
    state.faixas = [];
    state.faixaWrites = [];
  });

  it("adiciona a mesma faixa de segunda a sexta num envio só", async () => {
    const result = await setAvailability({ ok: true, data: undefined }, multiDayForm([2, 3, 4, 5, 6]));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.faixaWrites.map((row) => row.weekday)).toEqual([2, 3, 4, 5, 6]);
    expect(state.faixaWrites.every((row) => row.start_time === "08:00" && row.end_time === "18:00")).toBe(true);
  });

  it("não adiciona nada quando um dos dias já tem faixa sobreposta e diz qual", async () => {
    state.faixas = [{ id: "quarta", weekday: 4, start_time: "09:00:00", end_time: "10:00:00" }];

    const result = await setAvailability({ ok: true, data: undefined }, multiDayForm([2, 3, 4]));

    expect(result).toMatchObject({ ok: false, code: "OVERLAP", message: expect.stringContaining("Quarta") });
    expect(state.faixaWrites).toEqual([]);
  });

  it("pede pelo menos um dia", async () => {
    const result = await setAvailability({ ok: true, data: undefined }, multiDayForm([]));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION", message: "Escolha pelo menos um dia da semana." });
  });
});

import { describe, expect, it } from "vitest";
import {
  bookingLocalDate,
  bookingLocalTime,
  businessWeekday,
  dayGridTimes,
  filterAgenda,
  weekDateKeys,
  type AgendaBooking,
} from "@/lib/agenda/view";

// A booking's start_at is stored in UTC; whether it belongs to a given day is
// decided by the business timezone. A booking at 00:00Z is still the *previous*
// local day in America/Sao_Paulo (UTC-3).
const SP = "America/Sao_Paulo";
const LATE_UTC = "2026-09-02T00:00:00.000Z";

describe("bookingLocalDate", () => {
  it("returns the local calendar date in the business timezone", () => {
    expect(bookingLocalDate(LATE_UTC, SP)).toBe("2026-09-01");
  });

  it("usa fuso fixo da aplicação: mesmo com UTC passado, cai no dia de SP", () => {
    expect(bookingLocalDate(LATE_UTC, "UTC")).toBe("2026-09-01");
  });

  it("keeps a daytime booking on the same date", () => {
    expect(bookingLocalDate("2026-09-02T16:00:00.000Z", SP)).toBe("2026-09-02");
  });
});

describe("weekDateKeys", () => {
  it("returns the Monday–Sunday week of a reference date (ISO week, Monday start)", () => {
    // 2026-09-02 is a Wednesday; the week starts on Monday 2026-08-31.
    expect(weekDateKeys("2026-09-02")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("treats a Sunday reference as the end of its week", () => {
    // 2026-09-06 is a Sunday -> week Mon 2026-08-31 .. Sun 2026-09-06.
    expect(weekDateKeys("2026-09-06")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("is deterministic across month/year boundaries", () => {
    // 2026-08-31 is a Monday.
    expect(weekDateKeys("2026-08-31")[0]).toBe("2026-08-31");
  });
});

describe("bookingLocalTime", () => {
  it("converts a UTC instant to business-local HH:MM", () => {
    // 14:00 UTC is 11:00 in São Paulo (UTC-3).
    expect(bookingLocalTime("2026-09-02T14:00:00.000Z", SP)).toBe("11:00");
  });
});

describe("dayGridTimes", () => {
  it("emits a row per slot boundary, excluding the end", () => {
    expect(dayGridTimes("08:00", "12:00", 30)).toEqual([
      "08:00",
      "08:30",
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
  });

  it("reaches the last boundary before the end (no booking left off the grid)", () => {
    // A booking can sit on the last slot that fits before end; the row must exist.
    expect(dayGridTimes("08:00", "09:30", 30)).toEqual(["08:00", "08:30", "09:00"]);
  });
});

describe("businessWeekday", () => {
  it("uses Sunday=1..Saturday=7 (the availability form convention)", () => {
    // 2026-09-02 is a Wednesday.
    expect(businessWeekday("2026-09-02")).toBe(4);
    // 2026-09-06 is a Sunday.
    expect(businessWeekday("2026-09-06")).toBe(1);
  });
});

describe("filterAgenda", () => {
  const b = (over: Partial<AgendaBooking> & { id: string }): AgendaBooking => ({
    id: over.id,
    start_at: over.start_at ?? "2026-09-02T16:00:00.000Z",
    end_at: over.end_at ?? "2026-09-02T16:30:00.000Z",
    status: over.status ?? "confirmed",
    service_name_snapshot: over.service_name_snapshot ?? "Corte",
    duration_minutes_snapshot: over.duration_minutes_snapshot ?? 30,
    customer_name_snapshot: over.customer_name_snapshot ?? "Maria",
    customer_phone_snapshot: over.customer_phone_snapshot ?? "+5511900000000",
  });

  it("filters by local date (tz-aware)", () => {
    const bookings = [
      b({ id: "a", start_at: LATE_UTC }), // 2026-09-01 in São Paulo
      b({ id: "b", start_at: "2026-09-02T16:00:00.000Z" }), // 2026-09-02
    ];
    const out = filterAgenda(bookings, { filters: { dateKey: "2026-09-02" } });
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });

  it("filters by status", () => {
    const bookings = [
      b({ id: "a", status: "confirmed" }),
      b({ id: "b", status: "cancelled" }),
    ];
    const out = filterAgenda(bookings, { filters: { status: "cancelled" } });
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });

  it("combines date and status", () => {
    const bookings = [
      b({ id: "a", start_at: LATE_UTC, status: "confirmed" }),
      b({ id: "b", start_at: "2026-09-02T16:00:00.000Z", status: "completed" }),
      b({ id: "c", start_at: "2026-09-02T17:00:00.000Z", status: "confirmed" }),
    ];
    const out = filterAgenda(bookings, {
      filters: { dateKey: "2026-09-02", status: "confirmed" },
    });
    expect(out.map((x) => x.id)).toEqual(["c"]);
  });

  it("no filters returns everything unchanged", () => {
    const bookings = [b({ id: "a" }), b({ id: "b" })];
    expect(filterAgenda(bookings, { filters: {} })).toEqual(bookings);
  });
});

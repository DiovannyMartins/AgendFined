import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RANGE_KEY,
  buildBillingReport,
  buildBillingReportResult,
  filterBookingsByRange,
  formatRate,
  resolveRange,
  groupReportBookings,
  type FetchReportGroups,
  type ReportBooking,
  type ReportBusiness,
} from "@/lib/reports/reports";

// A worked example: the literals below are the independent source of truth. Any
// change to the math that breaks these numbers is a regression.
const bookings: ReportBooking[] = [
  { id: "b1", status: "completed", start_at: "2026-01-05T10:00:00Z", price_cents_snapshot: 4000, service_name_snapshot: "Corte" },
  { id: "b2", status: "completed", start_at: "2026-01-06T10:00:00Z", price_cents_snapshot: 4000, service_name_snapshot: "Corte" },
  { id: "b3", status: "completed", start_at: "2026-01-10T10:00:00Z", price_cents_snapshot: 2500, service_name_snapshot: "Barba" },
  { id: "b4", status: "cancelled", start_at: "2026-01-15T10:00:00Z", price_cents_snapshot: 3000, service_name_snapshot: "Corte" },
  { id: "b5", status: "no_show", start_at: "2026-01-20T10:00:00Z", price_cents_snapshot: 2000, service_name_snapshot: "Sobrancelha" },
  { id: "b6", status: "confirmed", start_at: "2026-01-25T10:00:00Z", price_cents_snapshot: 4000, service_name_snapshot: "Corte" },
];

const range = { from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" };

describe("filterBookingsByRange", () => {
  it("keeps bookings whose start_at falls inside [from, to) and drops the rest", () => {
    const ids = filterBookingsByRange(bookings, range.from, range.to).map((b) => b.id);
    expect(ids).toEqual(["b1", "b2", "b3", "b4", "b5", "b6"]);
  });

  it("treats the range as half-open: a booking exactly at `to` is excluded", () => {
    const atEnd: ReportBooking[] = [...bookings, { id: "b7", status: "completed", start_at: "2026-02-01T00:00:00Z", price_cents_snapshot: 999, service_name_snapshot: "X" }];
    const ids = filterBookingsByRange(atEnd, range.from, range.to).map((b) => b.id);
    expect(ids).toEqual(["b1", "b2", "b3", "b4", "b5", "b6"]);
  });

  it("a booking exactly at `from` is included", () => {
    const atStart: ReportBooking[] = [{ id: "b0", status: "completed", start_at: "2026-01-01T00:00:00Z", price_cents_snapshot: 100, service_name_snapshot: "X" }, ...bookings];
    expect(filterBookingsByRange(atStart, range.from, range.to).map((b) => b.id)).toContain("b0");
  });
});

describe("buildBillingReport", () => {
  it("counts rows by status and sums revenue only from completed bookings", () => {
    const report = buildBillingReport(bookings, range);
    expect(report.totalBookings).toBe(6);
    expect(report.confirmed).toBe(1);
    expect(report.completed).toBe(3);
    expect(report.cancelled).toBe(1);
    expect(report.noShow).toBe(1);
    // Completed only: 4000 + 4000 + 2500. Cancelled/confirmed/no_show are not revenue.
    expect(report.revenueCents).toBe(10500);
  });

  it("picks the best-selling service by completed count, tie-break by revenue", () => {
    const report = buildBillingReport(bookings, range);
    expect(report.topService).toEqual({ name: "Corte", count: 2, revenueCents: 8000 });
  });

  it("reports the cancellation and no-show rates over every booking in the period", () => {
    const report = buildBillingReport(bookings, range);
    expect(report.cancellationRate).toBeCloseTo(1 / 6, 10);
    expect(report.noShowRate).toBeCloseTo(1 / 6, 10);
  });

  it("ignores bookings outside the range", () => {
    const outside = { ...bookings[0], id: "b1", start_at: "2025-12-31T23:00:00Z" };
    const report = buildBillingReport([outside], range);
    expect(report.totalBookings).toBe(0);
    expect(report.revenueCents).toBe(0);
    expect(report.topService).toBeNull();
  });

  it("handles an empty period without dividing by zero", () => {
    const report = buildBillingReport([], range);
    expect(report.totalBookings).toBe(0);
    expect(report.revenueCents).toBe(0);
    expect(report.topService).toBeNull();
    expect(report.cancellationRate).toBe(0);
    expect(report.noShowRate).toBe(0);
  });

  it("tie-breaks services with equal completed counts by total revenue", () => {
    const tie: ReportBooking[] = [
      { id: "t1", status: "completed", start_at: "2026-01-01T10:00:00Z", price_cents_snapshot: 2000, service_name_snapshot: "A" },
      { id: "t2", status: "completed", start_at: "2026-01-02T10:00:00Z", price_cents_snapshot: 9000, service_name_snapshot: "B" },
    ];
    const report = buildBillingReport(tie, range);
    expect(report.topService).toEqual({ name: "B", count: 1, revenueCents: 9000 });
  });
});

describe("resolveRange", () => {
  const NOW = new Date("2026-09-15T12:00:00.000Z");

  it("defaults an unknown/empty query to the 30-day lookback", () => {
    expect(resolveRange(undefined, NOW).key).toBe(DEFAULT_RANGE_KEY);
    expect(resolveRange("bogus", NOW).key).toBe(DEFAULT_RANGE_KEY);
    expect(resolveRange("", NOW).key).toBe(DEFAULT_RANGE_KEY);
  });

  it("computes a rolling lookback for known keys", () => {
    const { key, range } = resolveRange("7d", NOW);
    expect(key).toBe("7d");
    expect(range.from).toBe(new Date(NOW.getTime() - 7 * 86_400_000).toISOString());
    expect(range.to).toBe(NOW.toISOString());
  });

  it("opens the window to everything for 'all'", () => {
    const { range } = resolveRange("all", NOW);
    expect(range.from < "2000-01-01T00:00:00.000Z").toBe(true);
    expect(range.to > "2100-01-01T00:00:00.000Z").toBe(true);
  });
});

describe("format helpers", () => {
  it("formats rates as whole-percent", () => {
    expect(formatRate(1 / 3)).toBe("33%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(1)).toBe("100%");
  });
});

describe("buildBillingReportResult (Pro gate, ADR 0008)", () => {
  const proBusiness: ReportBusiness = { id: "biz-pro", plan: "pro" };
  const freeBusiness: ReportBusiness = { id: "biz-free", plan: "free" };
  const nullPlanBusiness: ReportBusiness = { id: "biz-null", plan: null };

  const fetch: FetchReportGroups = async () => groupReportBookings(bookings);

  it("returns no_business when there is no business", async () => {
    expect(await buildBillingReportResult(null, fetch)).toEqual({ status: "no_business" });
  });

  it("returns upgrade_required for a free business without fetching bookings", async () => {
    const spy = vi.fn(fetch);
    const result = await buildBillingReportResult(freeBusiness, spy);
    expect(result).toEqual({ status: "upgrade_required" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed for a business with a null plan", async () => {
    expect(await buildBillingReportResult(nullPlanBusiness, fetch)).toEqual({
      status: "upgrade_required",
    });
  });

  it("returns ok with the computed report for a pro business", async () => {
    const result = await buildBillingReportResult(proBusiness, fetch, "all");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.key).toBe("all");
      expect(result.report.totalBookings).toBe(6);
      expect(result.report.revenueCents).toBe(10500);
    }
  });

  it("returns error when the bookings fetch throws", async () => {
    const failing: FetchReportGroups = async () => {
      throw new Error("boom");
    };
    expect(await buildBillingReportResult(proBusiness, failing)).toEqual({ status: "error" });
  });
});

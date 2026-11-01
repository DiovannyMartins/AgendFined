// Billing-reports seam (INC-2). The math lives here as a pure
// module so it is unit-testable without a database: the report computations take
// the owner's bookings (already scoped by RLS) and the access gate decision takes
// an injected bookings fetch. The DB only supplies rows; this module turns them
// into the report the dashboard renders and decides whether the gate lets the
// business through. Uses the snapshot columns (service_name_snapshot,
// price_cents_snapshot) so the numbers are stable even if the service catalog
// changes later (per CONTEXT.md).
//
// Semantics (see SPEC §24):
//   * "faturamento" (revenue) = price of bookings that ended completed (only
//     attended-and-paid bookings are money).
//   * "serviço mais vendido" = service with the most COMPLETED bookings; ties
//     are broken by total revenue.
//   * "taxa de cancelamento" / "taxa de no-show" = cancelled / no_show bookings
//     over every booking in the period (confirmed + completed + cancelled +
//     no_show).
import type { BookingStatus } from "@/lib/bookings/transitions";
import { runAccessGated, type GatedBusiness } from "@/lib/plan/gate";

export type ReportBooking = {
  id: string;
  status: BookingStatus;
  start_at: string;
  price_cents_snapshot: number;
  service_name_snapshot: string;
};

export type DateRange = {
  from: string;
  to: string;
};

// Preset periods for the report. The period is a rolling lookback in UTC,
// computed from the passed clock, so the rule is unit-testable; "all" opens the
// window to every booking.
export type RangeKey = "7d" | "30d" | "90d" | "all";

export const RANGE_KEYS: RangeKey[] = ["7d", "30d", "90d", "all"];

export const DEFAULT_RANGE_KEY: RangeKey = "30d";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  all: "Sempre",
};

const LOOKBACK_DAYS: Record<Exclude<RangeKey, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

// Resolve a `?range=` query into a period, defaults to the 30-day lookback, and
// clamps an unknown value to the default so the UI never shows an empty period.
export function resolveRange(key: string | undefined, now: Date = new Date()): { key: RangeKey; range: DateRange } {
  const k: RangeKey = RANGE_KEYS.includes(key as RangeKey) ? (key as RangeKey) : DEFAULT_RANGE_KEY;
  if (k === "all") {
    return { key: k, range: { from: "0001-01-01T00:00:00.000Z", to: "9999-12-31T23:59:59.999Z" } };
  }
  const days = LOOKBACK_DAYS[k];
  const from = new Date(now.getTime() - days * 86_400_000);
  return { key: k, range: { from: from.toISOString(), to: now.toISOString() } };
}

export type TopService = {
  name: string;
  count: number;
  revenueCents: number;
};

export type BillingReport = {
  range: DateRange;
  totalBookings: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  revenueCents: number;
  topService: TopService | null;
  cancellationRate: number;
  noShowRate: number;
};

// Half-open [from, to): a booking starting exactly at `to` belongs to the next
// period, so consecutive ranges don't double-count a boundary booking.
export function filterBookingsByRange(
  bookings: ReportBooking[],
  from: string,
  to: string,
): ReportBooking[] {
  return bookings.filter((b) => b.start_at >= from && b.start_at < to);
}

// One aggregated row per (status, service): what the `billing_report_groups`
// RPC returns, so "Sempre" isn't cut at PostgREST's 1000 rows (#215).
export type ReportGroup = {
  status: BookingStatus;
  service_name_snapshot: string;
  booking_count: number;
  revenue_cents: number;
};

// In-memory twin of the RPC's `group by status, service_name_snapshot`.
export function groupReportBookings(bookings: ReportBooking[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const booking of bookings) {
    const key = `${booking.status}\u0000${booking.service_name_snapshot}`;
    const group = groups.get(key) ?? {
      status: booking.status,
      service_name_snapshot: booking.service_name_snapshot,
      booking_count: 0,
      revenue_cents: 0,
    };
    group.booking_count += 1;
    group.revenue_cents += booking.price_cents_snapshot;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function buildBillingReport(
  bookings: ReportBooking[],
  range: DateRange,
): BillingReport {
  return buildBillingReportFromGroups(
    groupReportBookings(filterBookingsByRange(bookings, range.from, range.to)),
    range,
  );
}

// The report from groups already scoped to the period.
export function buildBillingReportFromGroups(
  groups: ReportGroup[],
  range: DateRange,
): BillingReport {
  const counts = { confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
  let revenueCents = 0;
  const byService = new Map<string, { count: number; revenueCents: number }>();

  for (const group of groups) {
    const count = Number(group.booking_count);
    const revenue = Number(group.revenue_cents);
    counts[group.status] += count;

    // Only completed bookings are money, and the best-selling service counts
    // only COMPLETED bookings; tie-break by revenue.
    if (group.status === "completed") {
      revenueCents += revenue;
      const entry = byService.get(group.service_name_snapshot) ?? { count: 0, revenueCents: 0 };
      entry.count += count;
      entry.revenueCents += revenue;
      byService.set(group.service_name_snapshot, entry);
    }
  }

  let topService: TopService | null = null;
  for (const [name, entry] of byService) {
    if (
      topService === null ||
      entry.count > topService.count ||
      (entry.count === topService.count && entry.revenueCents > topService.revenueCents)
    ) {
      topService = { name, count: entry.count, revenueCents: entry.revenueCents };
    }
  }

  const total = counts.confirmed + counts.completed + counts.cancelled + counts.no_show;
  return {
    range,
    totalBookings: total,
    confirmed: counts.confirmed,
    completed: counts.completed,
    cancelled: counts.cancelled,
    noShow: counts.no_show,
    revenueCents,
    topService,
    cancellationRate: total === 0 ? 0 : counts.cancelled / total,
    noShowRate: total === 0 ? 0 : counts.no_show / total,
  };
}

// Raw rate (0..1) -> whole-percent string for the dashboard ("33%").
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ---------------------------------------------------------------------------
// Server-side result (ADR 0013). Reports need access: the gate is applied
// at the read boundary. `buildBillingReportResult` is the pure decision core —
// it checks the negócio's access first (fail-closed) and only fetches/computes the
// report when it has access, so a suspended negócio never sees report data. The
// groups fetch is injected so the gate is unit-testable without a database.
// ---------------------------------------------------------------------------

export type BillingReportResult =
  | { status: "no_business" }
  | { status: "error" }
  | { status: "access_required" }
  | { status: "ok"; key: RangeKey; range: DateRange; report: BillingReport };

export type ReportBusiness = GatedBusiness;

export type FetchReportGroups = (
  businessId: string,
  range: DateRange,
) => Promise<ReportGroup[]>;

export async function buildBillingReportResult(
  business: ReportBusiness | null,
  fetchGroups: FetchReportGroups,
  rangeKey?: string,
): Promise<BillingReportResult> {
  const { key, range } = resolveRange(rangeKey);
  const gated = await runAccessGated(business, (businessId) => fetchGroups(businessId, range));
  if (gated.status !== "ok") return gated;

  const report = buildBillingReportFromGroups(gated.data, range);
  return { status: "ok", key, range, report };
}

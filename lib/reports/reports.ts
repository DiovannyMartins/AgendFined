// Billing-reports seam (INC-2, Pro feature). The math lives here as a pure
// module so it is unit-testable without a database: the report computations take
// the owner's bookings (already scoped by RLS) and the Pro gate decision takes
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
import { runProGated, type GatedBusiness } from "@/lib/plan/gate";
import { classifyReportInsight, type ReportInsight } from "@/lib/typesafe/judgments";

export type { ReportInsight } from "@/lib/typesafe/judgments";

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

export function buildBillingReport(
  bookings: ReportBooking[],
  range: DateRange,
): BillingReport {
  const rows = filterBookingsByRange(bookings, range.from, range.to);

  const counts = { confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
  let revenueCents = 0;
  const byService = new Map<string, { count: number; revenueCents: number }>();

  for (const booking of rows) {
    counts[booking.status] += 1;
    if (booking.status === "completed") {
      revenueCents += booking.price_cents_snapshot;
    }

    // Best-selling service counts only COMPLETED bookings; tie-break by revenue.
    if (booking.status === "completed") {
      const entry = byService.get(booking.service_name_snapshot) ?? { count: 0, revenueCents: 0 };
      entry.count += 1;
      entry.revenueCents += booking.price_cents_snapshot;
      byService.set(booking.service_name_snapshot, entry);
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

  const total = rows.length;
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

export function formatCurrencyBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

// Raw rate (0..1) -> whole-percent string for the dashboard ("33%").
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ---------------------------------------------------------------------------
// Server-side result (ADR 0008). Reports are a Pro feature: the gate is applied
// at the read boundary. `buildBillingReportResult` is the pure decision core —
// it checks the business plan first (fail-closed) and only fetches/computes the
// report for Pro businesses, so a Free business can never see report data. The
// bookings fetch is injected so the gate is unit-testable without a database.
// ---------------------------------------------------------------------------

export type BillingReportResult =
  | { status: "no_business" }
  | { status: "error" }
  | { status: "upgrade_required" }
  | { status: "ok"; key: RangeKey; range: DateRange; report: BillingReport; insight?: ReportInsight };

export type ReportBusiness = GatedBusiness;

export type FetchReportBookings = (
  businessId: string,
  range: DateRange,
) => Promise<ReportBooking[]>;

export async function buildBillingReportResult(
  business: ReportBusiness | null,
  fetchBookings: FetchReportBookings,
  rangeKey?: string,
): Promise<BillingReportResult> {
  const { key, range } = resolveRange(rangeKey);
  const gated = await runProGated(business, (businessId) => fetchBookings(businessId, range));
  if (gated.status !== "ok") return gated;

  const report = buildBillingReport(gated.data, range);
  const insight = await classifyReportInsight(report);
  return insight && insight.confidence >= 0.7
    ? { status: "ok", key, range, report, insight }
    : { status: "ok", key, range, report };
}

// Owner calendar-export gate (ADR 0008). Exporting the agenda (.ics) is a Pro
// feature, so the same `assertProPlan` seam that gates reports/reminders funnels
// this boundary. `buildGcalExportResult` is the pure decision core: it checks
// the business plan first (fail-closed) and only fetches/builds the feed for a
// Pro business, so a Free business can never see its agenda export. The bookings
// fetch is injected so the gate is unit-testable without a database. The actual
// VCALENDAR serialisation lives in `lib/gcal/gcal`.
import { buildIcsFeed, type GcalBooking } from "@/lib/gcal/gcal";
import { runProGated, type GatedBusiness } from "@/lib/plan/gate";
import type { BookingStatus } from "@/lib/bookings/transitions";

export type GcalExportBooking = {
  id: string;
  status: BookingStatus;
  start_at: string;
  end_at: string;
  service_name_snapshot: string;
};

export type GcalExportBusiness = GatedBusiness & { timezone?: string };

export type FetchGcalBookings = (businessId: string) => Promise<GcalExportBooking[]>;

export type GcalExportResult =
  | { status: "no_business" }
  | { status: "error" }
  | { status: "upgrade_required" }
  | { status: "ok"; icsFeed: string; count: number };

// A booking belongs in the owner's agenda export only when it is confirmed and
// not in the past. Shared by the page (the "Próximas reservas" card) and the
// feed builder so the two never drift apart.
export function isUpcomingConfirmed(
  b: { status: BookingStatus; start_at: string },
  now: Date,
): boolean {
  return b.status === "confirmed" && new Date(b.start_at) >= now;
}

// The owner's upcoming confirmed bookings, mapped to calendar events for the
// importable .ics feed. Past and non-confirmed bookings are excluded.
export function toGcalBookings(rows: GcalExportBooking[], now: Date, timezone?: string): GcalBooking[] {
  return rows
    .filter((b) => isUpcomingConfirmed(b, now))
    .map((b) => ({
      summary: b.service_name_snapshot,
      startAt: b.start_at,
      endAt: b.end_at,
      timezone,
    }));
}

export async function buildGcalExportResult(
  business: GcalExportBusiness | null,
  fetchBookings: FetchGcalBookings,
  now: Date = new Date(),
): Promise<GcalExportResult> {
  const gated = await runProGated(business, (businessId) => fetchBookings(businessId));
  if (gated.status !== "ok") return gated;

  const events = toGcalBookings(gated.data, now);
  return { status: "ok", icsFeed: buildIcsFeed(events), count: events.length };
}

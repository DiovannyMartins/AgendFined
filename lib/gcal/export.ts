// Owner calendar-export gate (ADR 0013). Exporting the agenda (.ics) needs
// access, so the same `assertAccess` seam that gates reports funnels this
// boundary. `buildGcalExportResult` is the pure decision core: it checks the
// negócio's access first (fail-closed) and only fetches/builds the feed when it
// has access, so a suspended negócio never gets its agenda export. The bookings
// fetch is injected so the gate is unit-testable without a database. The actual
// VCALENDAR serialisation lives in `lib/gcal/gcal`.
import { buildIcsFeed, type GcalBooking } from "@/lib/gcal/gcal";
import { runAccessGated, type GatedBusiness } from "@/lib/plan/gate";
import type { BookingStatus } from "@/lib/bookings/transitions";
import { formatPhoneBR } from "@/lib/format/phone";

export type GcalExportBooking = {
  id: string;
  status: BookingStatus;
  start_at: string;
  end_at: string;
  service_name_snapshot: string;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  customer_note: string | null;
};

export type GcalExportBusiness = GatedBusiness & { timezone?: string };

export type FetchGcalBookings = (businessId: string) => Promise<GcalExportBooking[]>;

export type GcalExportResult =
  | { status: "no_business" }
  | { status: "error" }
  | { status: "access_required" }
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
// importable .ics feed. Past and non-confirmed bookings are excluded. Like the
// Google Calendar sync, the event names the cliente, so the owner sees who is
// coming, and its UID is the reserva id.
export function toGcalBookings(rows: GcalExportBooking[], now: Date, timezone?: string): GcalBooking[] {
  return rows
    .filter((b) => isUpcomingConfirmed(b, now))
    .map((b) => {
      const note = b.customer_note?.trim();
      return {
        uid: b.id,
        summary: `${b.service_name_snapshot} — ${b.customer_name_snapshot}`,
        description: [
          `Cliente: ${b.customer_name_snapshot}`,
          `Telefone: ${formatPhoneBR(b.customer_phone_snapshot)}`,
          note ? `Observação: ${note}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        startAt: b.start_at,
        endAt: b.end_at,
        timezone,
      };
    });
}

export async function buildGcalExportResult(
  business: GcalExportBusiness | null,
  fetchBookings: FetchGcalBookings,
  now: Date = new Date(),
): Promise<GcalExportResult> {
  const gated = await runAccessGated(business, (businessId) => fetchBookings(businessId));
  if (gated.status !== "ok") return gated;

  const events = toGcalBookings(gated.data, now, business?.timezone);
  return { status: "ok", icsFeed: buildIcsFeed(events), count: events.length };
}

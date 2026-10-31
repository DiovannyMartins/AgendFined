// Agenda view seam (INC-1). Pure helpers that turn the business's
// raw bookings into the shapes the dashboard's day/week grid renders. Booking
// `start_at`s are UTC; a "day" is measured in the app timezone, so
// the same instant can land on a different date.
import type { BookingStatus } from "@/lib/bookings/transitions";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { localDayRangeUtc } from "@/lib/booking/availability";

// What the agenda sends to the browser: an allowlist, built by
// `toAgendaBooking` (#215). The e-mail itself never leaves the server.
export interface AgendaBooking {
  id: string;
  start_at: string;
  status: BookingStatus;
  service_name_snapshot: string;
  duration_minutes_snapshot: number;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  // Without an e-mail the cliente gets no lembrete por e-mail (#195).
  has_email: boolean;
  public_code?: string;
  cancel_reason?: string | null;
  cancel_reason_category?: string | null;
  cancelled_by?: string | null;
  // Latest remarcação (#194), null for a reserva never moved.
  rescheduled_at?: string | null;
  customer_note?: string | null;
  customer_note_category?: string | null;
  customer_note_requires_follow_up?: boolean;
}

// Columns the agenda page reads; `toAgendaBooking` turns a row into the props.
export const AGENDA_BOOKING_COLUMNS =
  "id, start_at, status, service_name_snapshot, duration_minutes_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot, public_code, cancel_reason, cancel_reason_category, cancelled_by, rescheduled_at, customer_note, customer_note_requires_follow_up";

export type AgendaBookingRow = {
  id: string;
  start_at: string;
  status: BookingStatus;
  service_name_snapshot: string;
  duration_minutes_snapshot: number;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  customer_email_snapshot: string | null;
  public_code: string;
  cancel_reason: string | null;
  cancel_reason_category: string | null;
  cancelled_by: string | null;
  rescheduled_at: string | null;
  customer_note: string | null;
  customer_note_requires_follow_up: boolean;
};

// A new object with only the allowlisted keys, never the row by reference.
export function toAgendaBooking(row: AgendaBookingRow): AgendaBooking {
  return {
    id: row.id,
    start_at: row.start_at,
    status: row.status,
    service_name_snapshot: row.service_name_snapshot,
    duration_minutes_snapshot: row.duration_minutes_snapshot,
    customer_name_snapshot: row.customer_name_snapshot,
    customer_phone_snapshot: row.customer_phone_snapshot,
    has_email: Boolean(row.customer_email_snapshot?.trim()),
    public_code: row.public_code,
    cancel_reason: row.cancel_reason,
    cancel_reason_category: row.cancel_reason_category,
    cancelled_by: row.cancelled_by,
    rescheduled_at: row.rescheduled_at,
    customer_note: row.customer_note,
    customer_note_requires_follow_up: row.customer_note_requires_follow_up,
  };
}

// The Monday–Sunday week containing `dateKey` and the UTC interval [from, to)
// the agenda fetches for it: only the week on screen, never the history (#215).
export function agendaWeek(dateKey: string, timezone: string = APP_TIMEZONE): {
  days: string[];
  from: string;
  to: string;
} {
  const days = weekDateKeys(dateKey);
  return {
    days,
    from: localDayRangeUtc(days[0], timezone).start,
    to: localDayRangeUtc(days[6], timezone).end,
  };
}

// The same calendar date shifted by `delta` days.
export function shiftDateKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return utcDateKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

export interface AgendaFilters {
  dateKey?: string | null; // "YYYY-MM-DD" in the business tz; null filters all dates
  status?: BookingStatus | null;
}

// Minimal dashboard-facing shapes shared by the agenda's list and grid views.
export type AvailabilityRow = {
  weekday: number;
  start_time: string;
  end_time: string;
};

// Time rows (HH:MM) for a working range, one per `slotIntervalMinutes` starting
// at `start` and stopped before `end`. Emits every boundary a booking can sit on
// — unlike duration-aware slot generation, no booking is left off the grid.
export function dayGridTimes(start: string, end: string, slotIntervalMinutes: number): string[] {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const rows: string[] = [];
  for (let t = startMin; t < endMin; t += slotIntervalMinutes) {
    rows.push(minutesToTime(t));
  }
  return rows;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const dateKeyFormatter = (timezone: string = APP_TIMEZONE) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  });

// The local calendar date ("YYYY-MM-DD") on which a UTC instant falls.
export function bookingLocalDate(iso: string, timezone: string = APP_TIMEZONE): string {
  return dateKeyFormatter(timezone).format(new Date(iso));
}

// The local wall-clock "HH:MM" of a UTC instant (used to place a booking
// on the day grid's time rows).
export function bookingLocalTime(iso: string, timezone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso));
}

// DB weekday of a calendar date (Sunday=1 .. Saturday=7), matching the
// availability convention the form stores (1 = Domingo, ... 7 = Sábado).
export function businessWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1;
}

function utcDateKey(y: number, m: number, d: number): string {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

// The Monday–Sunday (ISO-week) calendar dates for the week containing `reference`
// (a bare "YYYY-MM-DD" calendar date, matched by the date the user is viewing).
// Arithmetic is done on UTC components so it is deterministic regardless of the
// host's timezone and DST.
export function weekDateKeys(reference: string): string[] {
  const [y, m, d] = reference.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - mondayOffset));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(
      Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + i),
    );
    return utcDateKey(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  });
}

// Apply the agenda filters. `dateKey` is matched in the app timezone; all filters combine
// with AND. Missing filters are ignored (treated as "all").
export function filterAgenda(
  bookings: AgendaBooking[],
  opts: { tz?: string; filters: AgendaFilters },
): AgendaBooking[] {
  const { filters, tz = APP_TIMEZONE } = opts;
  return bookings.filter((booking) => {
    if (
      filters.dateKey &&
      bookingLocalDate(booking.start_at, tz) !== filters.dateKey
    ) {
      return false;
    }
    if (filters.status && booking.status !== filters.status) {
      return false;
    }
    return true;
  });
}

const BOOKING_STATUSES: readonly BookingStatus[] = ["confirmed", "completed", "cancelled", "no_show"];
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The agenda filters live in the URL (`?data=YYYY-MM-DD&status=completed`) so a
// reload keeps them. Unknown or malformed values fall back to "all".
export function parseAgendaSearchParams(params: {
  data?: string | string[];
  status?: string | string[];
}): { dateKey: string | null; status: BookingStatus | null } {
  const data = typeof params.data === "string" ? params.data : null;
  const status = typeof params.status === "string" ? params.status : null;
  return {
    dateKey: data && DATE_KEY_PATTERN.test(data) && isRealDate(data) ? data : null,
    status: BOOKING_STATUSES.includes(status as BookingStatus) ? (status as BookingStatus) : null,
  };
}

// Query string ("" or "?…") for the agenda filters, the inverse of
// `parseAgendaSearchParams`.
export function agendaSearchString(filters: { dateKey: string | null; status: BookingStatus | null }): string {
  const params = new URLSearchParams();
  if (filters.dateKey) params.set("data", filters.dateKey);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function isRealDate(dateKey: string): boolean {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Agenda view seam (INC-1). Pure helpers that turn the business's
// raw bookings into the shapes the dashboard's day/week grid renders. Booking
// `start_at`s are UTC; a "day" is measured in the app timezone, so
// the same instant can land on a different date.
import type { BookingStatus } from "@/lib/bookings/transitions";
import { APP_TIMEZONE } from "@/lib/app-timezone";

export interface AgendaBooking {
  id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  service_name_snapshot: string;
  duration_minutes_snapshot: number;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  // Present on the full DB rows the agenda list renders; absent on filtered views.
  public_code?: string;
  cancel_reason?: string | null;
  cancel_reason_category?: string | null;
  customer_note?: string | null;
  customer_note_category?: string | null;
  customer_note_requires_follow_up?: boolean;
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

const dateKeyFormatter = (_tz?: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIMEZONE,
  });

// The local calendar date ("YYYY-MM-DD") on which a UTC instant falls.
export function bookingLocalDate(iso: string, _tz?: string): string {
  return dateKeyFormatter().format(new Date(iso));
}

// The local wall-clock "HH:MM" of a UTC instant (used to place a booking
// on the day grid's time rows).
export function bookingLocalTime(iso: string, _tz?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: APP_TIMEZONE,
  }).format(new Date(iso));
}

// DB weekday of a calendar date (Sunday=1 .. Saturday=7), matching the
// availability convention the form stores (1 - Domingo, ... 7 - Sábado).
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
  const { filters } = opts;
  return bookings.filter((booking) => {
    if (
      filters.dateKey &&
      bookingLocalDate(booking.start_at) !== filters.dateKey
    ) {
      return false;
    }
    if (filters.status && booking.status !== filters.status) {
      return false;
    }
    return true;
  });
}

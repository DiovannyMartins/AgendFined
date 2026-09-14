// Google Calendar export seam (INC-3). Real Google Calendar OAuth sync is out of
// scope here; the export surface (add-to-calendar template URL + a downloadable
// .ics) is the immediately-usable integration: it needs no OAuth consumer, no
// credentials and no attendee permissions, and it stays fully testable as pure
// functions of a booking snapshot. Times are stored in UTC (ADR 0003) and
// serialised as `YYYYMMDDTHHmmssZ` / `TZID`-free UTC, so a future sync seam can
// grow alongside without changing these exports.

export type GcalBooking = {
  summary: string;
  startAt: string; // ISO-8601 UTC instant
  endAt: string; // ISO-8601 UTC instant
  location?: string;
  description?: string;
  timezone?: string;
};

// A multi-event VCALENDAR feed (e.g. the business's active upcoming bookings),
// for the owner to import into their own calendar. Each event carries a
// deterministic UID so importing the same reservations twice does not duplicate.
export function buildIcsFeed(bookings: GcalBooking[]): string {
  const events = bookings.flatMap(buildSingleEvent);
  return [...calendarHeader(), ...events, "END:VCALENDAR"].join("\r\n");
}

function buildSingleEvent(b: GcalBooking): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:agendfined-${toGcalUtc(b.startAt)}-${escapeText(b.summary)}`,
    `DTSTAMP:${toGcalUtc(new Date().toISOString())}`,
    `DTSTART:${toGcalUtc(b.startAt)}`,
    `DTEND:${toGcalUtc(b.endAt)}`,
    `SUMMARY:${escapeText(b.summary)}`,
    ...(b.location ? [`LOCATION:${escapeText(b.location)}`] : []),
    ...(b.description ? [`DESCRIPTION:${escapeText(b.description)}`] : []),
    "END:VEVENT",
  ];
}

function calendarHeader(): string[] {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AgendFined//Agendamento//PT-BR"];
}

// Google Calendar "add to calendar" template URL (action=TEMPLATE). Public and
// credential-free; opens the new-event dialog pre-filled for the visitor.
export function buildGoogleCalendarUrl(b: GcalBooking): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: b.summary,
    dates: `${toGcalUtc(b.startAt)}/${toGcalUtc(b.endAt)}`,
    ctz: b.timezone ?? "America/Sao_Paulo",
  });
  if (b.location) params.set("location", b.location);
  if (b.description) params.set("details", b.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// RFC 5545 VCALENDAR for a single booking (downloadable file). Uses UTC Z
// timestamps so a consumer importing the .ics gets the exact moment regardless of
// their own timezone.
export function buildIcsString(b: GcalBooking): string {
  return [...calendarHeader(), ...buildSingleEvent(b), "END:VCALENDAR"].join("\r\n");
}

// `2026-09-01T20:00:00.000Z` -> `20260901T200000Z` (Google calendar / ICS basic
// format, already in UTC).
function toGcalUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// RFC 5545: escape `\`, `;`, `,` and newlines inside text values.
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

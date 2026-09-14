import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl, buildIcsFeed, buildIcsString, type GcalBooking } from "@/lib/gcal/gcal";

const booking: GcalBooking = {
  summary: "Corte de cabelo",
  startAt: "2026-09-01T20:00:00.000Z",
  endAt: "2026-09-01T20:30:00.000Z",
  location: "Barbearia Demo",
  description: "Reserva em Barbearia Demo",
};

describe("buildGoogleCalendarUrl (INC-3: export de reserva)", () => {
  it("produces a Google Calendar TEMPLATE render URL", () => {
    const url = buildGoogleCalendarUrl(booking);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(parsed.searchParams.get("action")).toBe("TEMPLATE");
    expect(parsed.searchParams.get("text")).toBe("Corte de cabelo");
    expect(parsed.searchParams.get("ctz")).toBe("America/Sao_Paulo");
    expect(parsed.searchParams.get("location")).toBe("Barbearia Demo");
    expect(parsed.searchParams.get("details")).toBe("Reserva em Barbearia Demo");
  });

  it("encodes the dates in the Google calendar YYYYMMDDTHHmmssZ format (UTC)", () => {
    const url = buildGoogleCalendarUrl(booking);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("dates")).toBe("20260901T200000Z/20260901T203000Z");
  });

  it("omits optional query params when absent", () => {
    const url = buildGoogleCalendarUrl({ summary: "S", startAt: "2026-09-01T20:00:00.000Z", endAt: "2026-09-01T20:30:00.000Z" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("location")).toBeNull();
    expect(parsed.searchParams.get("details")).toBeNull();
  });
});

describe("buildIcsString (INC-3: .ics da reserva)", () => {
  it("renders a VCALENDAR/VEVENT with UTC timestamps in Z format", () => {
    const ics = buildIcsString(booking);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("DTSTART:20260901T200000Z");
    expect(ics).toContain("DTEND:20260901T203000Z");
    expect(ics).toContain("SUMMARY:Corte de cabelo");
    expect(ics).toContain("LOCATION:Barbearia Demo");
  });

  it("escapes commas, semicolons and backslashes in text fields", () => {
    const ics = buildIcsString({ summary: "a,b;c\\d", startAt: "2026-09-01T20:00:00.000Z", endAt: "2026-09-01T20:30:00.000Z" });
    expect(ics).toContain("SUMMARY:a\\,b\\;c\\\\d");
  });

  it("uses CRLF line endings as RFC 5545 requires", () => {
    const ics = buildIcsString(booking);
    expect(ics).toContain("\r\n");
  });
});

describe("buildIcsFeed (export de várias reservas do dono)", () => {
  it("renders one VEVENT per booking inside a shared VCALENDAR", () => {
    const feed = buildIcsFeed([booking, { ...booking, summary: "Barba", startAt: "2026-09-01T21:00:00.000Z", endAt: "2026-09-01T21:30:00.000Z" }]);
    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).toContain("END:VCALENDAR");
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(feed).toContain("SUMMARY:Corte de cabelo");
    expect(feed).toContain("SUMMARY:Barba");
    expect(feed).toContain("\r\n");
  });

  it("gives each event a deterministic UID based on start + summary", () => {
    const feed = buildIcsFeed([booking]);
    expect(feed).toContain("UID:agendfined-20260901T200000Z-Corte de cabelo");
  });
});

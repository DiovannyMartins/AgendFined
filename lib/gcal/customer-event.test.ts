import { describe, expect, it } from "vitest";
import {
  buildCustomerIcs,
  customerCalendarLinks,
  customerGoogleCalendarUrl,
  customerIcsFilename,
  type CustomerCalendarBooking,
} from "@/lib/gcal/customer-event";

const ORIGIN = new URL("https://agendfined.test");

// 09:00 em Manaus (UTC-4) é 13:00 UTC, e não 12:00 como seria em São Paulo.
const booking: CustomerCalendarBooking = {
  code: "65925DBB",
  service_name: "Corte, barba; e sobrancelha",
  start_at: "2026-11-03T13:00:00+00:00",
  end_at: "2026-11-03T13:45:00+00:00",
  business_name: "Barbearia \\ Demo",
  business_slug: "barbearia",
  business_phone: "11987654321",
  business_timezone: "America/Manaus",
};

// Undoes the RFC 5545 line folding, one content line per entry.
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

// #196: o cliente salva a própria reserva na agenda do celular.
describe("buildCustomerIcs", () => {
  it("writes start and end as UTC instants, whatever the fuso do negócio", () => {
    const lines = unfold(buildCustomerIcs(booking, ORIGIN));

    expect(lines).toContain("DTSTART:20261103T130000Z");
    expect(lines).toContain("DTEND:20261103T134500Z");
    expect(lines.some((line) => line.startsWith("DTSTART;TZID"))).toBe(false);
  });

  it("keeps the UID stable by the código público", () => {
    const first = unfold(buildCustomerIcs(booking, ORIGIN));
    const renamed = unfold(buildCustomerIcs({ ...booking, service_name: "Outro" }, ORIGIN));

    expect(first).toContain("UID:reserva-65925DBB@agendfined");
    expect(renamed).toContain("UID:reserva-65925DBB@agendfined");
  });

  it("escapes commas, semicolons and backslashes in the serviço and negócio names", () => {
    const lines = unfold(buildCustomerIcs(booking, ORIGIN));

    expect(lines).toContain("SUMMARY:Corte\\, barba\\; e sobrancelha — Barbearia \\\\ Demo");
  });

  it("describes the negócio's phone, the código and the public link, as escaped newlines", () => {
    const description = unfold(buildCustomerIcs(booking, ORIGIN)).find((line) => line.startsWith("DESCRIPTION:"));

    expect(description).toBe(
      "DESCRIPTION:Reserva em Barbearia \\\\ Demo\\nTelefone: (11) 98765-4321\\nCódigo da reserva: 6592-5DBB\\nhttps://agendfined.test/barbearia",
    );
  });

  it("writes a single VEVENT with only CRLF terminators when the names carry line breaks", () => {
    const ics = buildCustomerIcs(
      { ...booking, service_name: "Corte\rBarba", business_name: "Barbearia\u2028Demo\u0085Centro" },
      ORIGIN,
    );
    const lines = unfold(ics);

    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\p{Cc}\u2028\u2029]/u);
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines).toContain("SUMMARY:Corte\\nBarba — Barbearia\\nDemo\\nCentro");
  });

  it("never carries the token de cancelamento or a confirmation link", () => {
    const ics = buildCustomerIcs(booking, ORIGIN);

    expect(ics).not.toMatch(/cancel|token|confirmacao/i);
  });

  it("leaves the phone out when the negócio has none", () => {
    const ics = buildCustomerIcs({ ...booking, business_phone: null }, ORIGIN);

    expect(ics).not.toContain("Telefone");
  });
});

describe("customerGoogleCalendarUrl", () => {
  it("pre-fills the same event in the fuso do negócio", () => {
    const url = new URL(customerGoogleCalendarUrl(booking, ORIGIN));

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Corte, barba; e sobrancelha — Barbearia \\ Demo");
    expect(url.searchParams.get("dates")).toBe("20261103T130000Z/20261103T134500Z");
    expect(url.searchParams.get("ctz")).toBe("America/Manaus");
    expect(url.searchParams.get("details")).toContain("https://agendfined.test/barbearia");
  });
});

describe("customerCalendarLinks", () => {
  it("points the .ics at this código on the negócio's confirmation path", () => {
    const links = customerCalendarLinks(booking, ORIGIN);

    expect(links.icsHref).toBe("/barbearia/confirmacao/evento.ics?code=65925DBB");
    expect(links.googleHref).toBe(customerGoogleCalendarUrl(booking, ORIGIN));
  });
});

describe("customerIcsFilename", () => {
  it("names the file after the grouped código", () => {
    expect(customerIcsFilename("65925DBB")).toBe("reserva-6592-5DBB.ics");
  });
});

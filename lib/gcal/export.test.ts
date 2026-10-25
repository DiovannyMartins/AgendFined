import { describe, expect, it, vi } from "vitest";
import {
  buildGcalExportResult,
  isUpcomingConfirmed,
  type FetchGcalBookings,
  type GcalExportBooking,
  type GcalExportBusiness,
} from "@/lib/gcal/export";

// A fixed clock so the "upcoming" filter is deterministic.
const now = new Date("2026-09-01T12:00:00.000Z");

const proBusiness: GcalExportBusiness = {
  id: "biz-pro",
  plan: "pro",
};
const freeBusiness: GcalExportBusiness = {
  id: "biz-free",
  plan: "free",
};

const upcoming: GcalExportBooking = {
  id: "b1",
  status: "confirmed",
  start_at: "2026-09-02T10:00:00.000Z",
  end_at: "2026-09-02T10:30:00.000Z",
  service_name_snapshot: "Corte",
  customer_name_snapshot: "Ana Souza",
  customer_phone_snapshot: "11987654321",
  customer_note: null,
};
const customer = { customer_name_snapshot: "Bia", customer_phone_snapshot: "11911112222", customer_note: null };

describe("buildGcalExportResult (Pro gate, ADR 0008)", () => {
  it("returns no_business when there is no business", async () => {
    const result = await buildGcalExportResult(null, async () => [], now);
    expect(result).toEqual({ status: "no_business" });
  });

  it("returns upgrade_required for a free business without fetching bookings", async () => {
    const spy = vi.fn<FetchGcalBookings>(async () => []);
    const result = await buildGcalExportResult(freeBusiness, spy, now);
    expect(result).toEqual({ status: "upgrade_required" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed for a business with a null plan", async () => {
    const result = await buildGcalExportResult(
      { id: "biz", plan: null },
      async () => [],
      now,
    );
    expect(result).toEqual({ status: "upgrade_required" });
  });

  it("returns ok with an importable .ics feed for a pro business", async () => {
    const result = await buildGcalExportResult(proBusiness, async () => [upcoming], now);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.count).toBe(1);
      expect(result.icsFeed).toContain("BEGIN:VCALENDAR");
      expect(result.icsFeed).toContain("END:VCALENDAR");
      expect(result.icsFeed).toContain("SUMMARY:Corte");
      expect(result.icsFeed).toContain("DTSTART:20260902T100000Z");
    }
  });

  it("excludes past and non-confirmed bookings from the feed", async () => {
    const rows: GcalExportBooking[] = [
      upcoming,
      {
        id: "past",
        status: "confirmed",
        start_at: "2026-08-01T10:00:00.000Z",
        end_at: "2026-08-01T10:30:00.000Z",
        service_name_snapshot: "Passado",
        ...customer,
      },
      {
        id: "cancelled",
        status: "cancelled",
        start_at: "2026-09-03T10:00:00.000Z",
        end_at: "2026-09-03T10:30:00.000Z",
        service_name_snapshot: "Cancelada",
        ...customer,
      },
    ];
    const result = await buildGcalExportResult(proBusiness, async () => rows, now);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.count).toBe(1);
      expect(result.icsFeed).toContain("SUMMARY:Corte");
      expect(result.icsFeed).not.toContain("SUMMARY:Passado");
      expect(result.icsFeed).not.toContain("SUMMARY:Cancelada");
    }
  });

  it("names the cliente and phone, and keys the event by the reserva id", async () => {
    const withNote = { ...upcoming, customer_note: "Alergia a lâmina" };
    const result = await buildGcalExportResult(proBusiness, async () => [withNote], now);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.icsFeed).toContain("SUMMARY:Corte — Ana Souza");
      // Long lines are folded (RFC 5545 §3.1); compare the unfolded content.
      expect(result.icsFeed.replace(/\r\n /g, "")).toContain(
        "DESCRIPTION:Cliente: Ana Souza\\nTelefone: (11) 98765-4321\\nObservação: Alergia a lâmina",
      );
      expect(result.icsFeed).toContain("UID:b1@agendfined");
    }
  });

  it("keeps the UID when the serviço is renamed, so a reimport does not duplicate", async () => {
    const before = await buildGcalExportResult(proBusiness, async () => [upcoming], now);
    const after = await buildGcalExportResult(proBusiness, async () => [{ ...upcoming, service_name_snapshot: "Corte novo" }], now);
    const uid = (r: typeof before) => (r.status === "ok" ? r.icsFeed.match(/^UID:.*$/m)?.[0] : null);
    expect(uid(after)).toBe(uid(before));
  });

  it("returns error when the bookings fetch throws", async () => {
    const failing: FetchGcalBookings = async () => {
      throw new Error("boom");
    };
    const result = await buildGcalExportResult(proBusiness, failing, now);
    expect(result).toEqual({ status: "error" });
  });
});

describe("isUpcomingConfirmed (shared with the agenda page)", () => {
  it("is true only for a confirmed, not-yet-started booking", () => {
    expect(isUpcomingConfirmed({ status: "confirmed", start_at: "2026-09-02T10:00:00.000Z" }, now)).toBe(true);
    expect(isUpcomingConfirmed({ status: "confirmed", start_at: "2026-08-01T10:00:00.000Z" }, now)).toBe(false);
    expect(isUpcomingConfirmed({ status: "cancelled", start_at: "2026-09-02T10:00:00.000Z" }, now)).toBe(false);
  });
});

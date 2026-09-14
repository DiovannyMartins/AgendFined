import { describe, expect, it } from "vitest";
import {
  lookupBookingByPublicCode,
  toConsultState,
  type LookupFetcher,
} from "@/lib/bookings/lookup";

// The lookup is a pure function given a fetcher injected at the system boundary
// (the db). This keeps it unit-testable without a real Supabase client (§mock).
const row = {
  service_name: "Corte",
  start_at: "2026-09-01T20:00:00.000Z",
  end_at: "2026-09-01T20:30:00.000Z",
  business_name: "Barbearia Demo",
  business_slug: "barbearia-demo",
  business_phone: "+5511987654321",
};

const fetcher: LookupFetcher = async () => ({ data: row, error: null });

describe("lookupBookingByPublicCode", () => {
  it("maps a found row to a normalized public booking", async () => {
    const res = await lookupBookingByPublicCode(fetcher, "AB12CD34");
    expect(res).toEqual({
      ok: true,
      data: {
        serviceName: "Corte",
        startAt: "2026-09-01T20:00:00.000Z",
        endAt: "2026-09-01T20:30:00.000Z",
        businessName: "Barbearia Demo",
        businessSlug: "barbearia-demo",
        businessPhone: "+5511987654321",
      },
    });
  });

  it("returns NOT_FOUND when no booking matches the code", async () => {
    const empty: LookupFetcher = async () => ({ data: null, error: null });
    const res = await lookupBookingByPublicCode(empty, "AB12CD34");
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("returns INVALID_CODE for a non-code input without calling the fetcher", async () => {
    let called = false;
    const spy: LookupFetcher = async () => {
      called = true;
      return { data: row, error: null };
    };
    const res = await lookupBookingByPublicCode(spy, "not-a-code");
    expect(called).toBe(false);
    expect(res).toMatchObject({ ok: false, code: "INVALID_CODE" });
  });

  it("returns DB_ERROR when the database reports an error", async () => {
    const failing: LookupFetcher = async () => ({ data: null, error: { message: "boom" } });
    const res = await lookupBookingByPublicCode(failing, "AB12CD34");
    expect(res).toMatchObject({ ok: false, code: "DB_ERROR" });
  });
});

describe("toConsultState", () => {
  it("maps a found lookup to a success state", () => {
    expect(
      toConsultState({
        ok: true,
        data: {
          serviceName: "Corte",
          startAt: "2026-09-01T20:00:00.000Z",
          endAt: "2026-09-01T20:30:00.000Z",
          businessName: "Barbearia Demo",
          businessSlug: "barbearia-demo",
          businessPhone: "+5511987654321",
        },
      }),
    ).toEqual({
      status: "success",
      booking: {
        serviceName: "Corte",
        startAt: "2026-09-01T20:00:00.000Z",
        endAt: "2026-09-01T20:30:00.000Z",
        businessName: "Barbearia Demo",
        businessSlug: "barbearia-demo",
        businessPhone: "+5511987654321",
      },
    });
  });

  it("maps an error lookup to an error state", () => {
    expect(toConsultState({ ok: false, code: "NOT_FOUND", message: "Nenhuma reserva encontrada." })).toEqual({
      status: "error",
      code: "NOT_FOUND",
      message: "Nenhuma reserva encontrada.",
    });
  });
});

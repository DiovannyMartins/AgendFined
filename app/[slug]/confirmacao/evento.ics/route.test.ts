import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/app-origin", () => ({ resolveAppOrigin: () => new URL("https://agendfined.test") }));

const { GET } = await import("./route");

const FUTURE_START = new Date(Date.now() + 7 * 24 * 60 * 60_000);

function bookingRow(status = "confirmed", startAt = FUTURE_START) {
  return {
    service_name: "Corte",
    start_at: startAt.toISOString(),
    end_at: new Date(startAt.getTime() + 30 * 60_000).toISOString(),
    business_name: "Barbearia Demo",
    business_slug: "barbearia",
    business_phone: "11987654321",
    business_timezone: "America/Sao_Paulo",
    status,
  };
}

function get(code?: string) {
  const url = new URL("https://agendfined.test/barbearia/confirmacao/evento.ics");
  if (code !== undefined) url.searchParams.set("code", code);
  return GET(new NextRequest(url));
}

// #196: "Adicionar à minha agenda" baixa o .ics de um evento da reserva.
describe("GET /[slug]/confirmacao/evento.ics", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [bookingRow()], error: null });
  });

  it("serves the confirmed reserva as a calendar the phone opens directly", async () => {
    const response = await get("6592-5dbb");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="reserva-6592-5DBB.ics"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(rpc).toHaveBeenCalledWith("get_booking_by_public_code", { p_code: "65925DBB" });
    const ics = (await response.text()).replace(/\r\n /g, "");
    expect(ics).toContain("UID:reserva-65925DBB@agendfined");
    expect(ics).toContain("SUMMARY:Corte — Barbearia Demo");
    expect(ics).toContain("https://agendfined.test/barbearia");
  });

  it.each([
    ["a missing code", undefined],
    ["a malformed code", "123"],
  ])("answers 404 for %s without a lookup", async (_case, code) => {
    const response = await get(code);

    expect(response.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown code", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    expect((await get("65925DBB")).status).toBe(404);
  });

  it.each([
    ["cancelled", FUTURE_START],
    ["completed", FUTURE_START],
    ["confirmed", new Date(Date.now() - 60 * 60_000)],
  ])("offers no event for a %s reserva starting %s", async (status, startAt) => {
    rpc.mockResolvedValue({ data: [bookingRow(status, startAt)], error: null });

    const response = await get("65925DBB");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toContain("text/calendar");
  });

  it("answers an unknown code and a reserva without an event alike", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const unknown = await get("65925DBB");
    rpc.mockResolvedValue({ data: [bookingRow("cancelled", FUTURE_START)], error: null });
    const cancelled = await get("65925DBB");

    expect(cancelled.status).toBe(unknown.status);
    expect(await cancelled.text()).toBe(await unknown.text());
  });

  it("answers 503 when the lookup fails, which says nothing about the reserva", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });

    expect((await get("65925DBB")).status).toBe(503);
  });
});

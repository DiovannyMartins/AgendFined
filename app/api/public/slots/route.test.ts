import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getPublicSlots } = vi.hoisted(() => ({ getPublicSlots: vi.fn() }));
vi.mock("@/lib/availability/public-slots", () => ({ getPublicSlots }));

import { GET } from "./route";

function request(query: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/public/slots?${query}`, { headers });
}

describe("GET /api/public/slots", () => {
  beforeEach(() => {
    getPublicSlots.mockReset();
  });

  it("answers only the free slots, never cached", async () => {
    getPublicSlots.mockResolvedValue({ available: ["09:00", "09:30"] });

    const response = await GET(request("businessId=b&serviceId=s&date=2026-11-03", { "x-real-ip": "203.0.113.7" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["available"]);
    expect(body).toEqual({ available: ["09:00", "09:30"] });
    expect(getPublicSlots).toHaveBeenCalledWith(
      { businessId: "b", serviceId: "s", date: "2026-11-03" },
      "203.0.113.7",
    );
  });

  it.each([
    ["validation", 400],
    ["not_found", 404],
    ["service_not_found", 404],
    ["booking_window", 422],
    ["rate_limited", 429],
    ["db_error", 503],
  ])("keeps the %s code in the body with status %i", async (error, status) => {
    getPublicSlots.mockResolvedValue({ available: [], error });

    const response = await GET(request("businessId=b&serviceId=s&date=2026-11-03"));

    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["available", "error"]);
    expect(body).toEqual({ available: [], error });
  });
});

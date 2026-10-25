// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type NextFetchEvent, NextRequest, NextResponse } from "next/server";

const sendSecurityLog = vi.fn(async () => {});

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: async () => ({ supabaseResponse: NextResponse.next(), user: null }),
}));
vi.mock("@/lib/security/betterstack", () => ({ sendSecurityLog }));
vi.mock("@/lib/booking/confirmation-gate", () => ({
  checkConfirmationOpening: async () => null,
  confirmationRefusalResponse: vi.fn(),
}));

const { proxy } = await import("./proxy");

describe("proxy request log", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    sendSecurityLog.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs how long the proxy took, in whole milliseconds", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValue(1_234.6);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const event = { waitUntil: vi.fn() } as unknown as NextFetchEvent;

    const response = await proxy(new NextRequest("https://agendfined.test/barbearia?code=SECRET"), event);

    expect(response.status).toBe(200);
    const entry = JSON.parse(String(info.mock.calls[0][0]));
    expect(entry).toMatchObject({
      event: "http.request",
      method: "GET",
      path: "/barbearia",
      status: 200,
      durationMs: 235,
    });
    expect(sendSecurityLog).toHaveBeenCalledWith(entry);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { syncCurrentSubscriptionAfterReturn } = vi.hoisted(() => ({
  syncCurrentSubscriptionAfterReturn: vi.fn(async () => undefined),
}));

vi.mock("@/lib/billing/actions", () => ({ syncCurrentSubscriptionAfterReturn }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceApiRateLimit: vi.fn(async () => true),
  getClientIpFromHeaders: vi.fn(() => "127.0.0.1"),
}));

import { GET } from "./route";

function request() {
  return new NextRequest("http://localhost:3000/api/billing/return?preapproval_id=mp_1");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("billing checkout return", () => {
  it("returns to the configured APP_URL origin, not the request's Host (issue #151)", async () => {
    vi.stubEnv("APP_URL", "http://beta.localhost:3000");

    const response = await GET(request());

    expect(syncCurrentSubscriptionAfterReturn).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe("http://beta.localhost:3000/dashboard/configuracoes");
    // #219: the redirect follows a per-payer sync; no cache may replay it.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps the request origin when no APP_URL is configured", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    const response = await GET(request());

    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard/configuracoes");
  });

  it("still returns to the painel when the provider sync fails", async () => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    syncCurrentSubscriptionAfterReturn.mockRejectedValueOnce(new Error("provider down"));

    const response = await GET(request());

    expect(response.headers.get("location")).toBe("https://agenda.example/dashboard/configuracoes");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { run } = vi.hoisted(() => ({ run: vi.fn(async () => []) }));
vi.mock("@/lib/billing/reconciliation-runner", () => ({ runBoundedReconciliation: run }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceApiRateLimit: async () => true,
  getClientIpFromHeaders: () => "127.0.0.1",
}));
import { GET, POST } from "./route";

function request(method: string, authorization?: string) {
  return new NextRequest("http://localhost/api/internal/reconciliation", { method, headers: authorization ? { authorization } : undefined });
}

describe("private reconciliation route", () => {
  afterEach(() => { vi.clearAllMocks(); delete process.env.RECONCILIATION_CRON_SECRET; });

  it("authorizes only the dedicated bearer secret", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    const response = await POST(request("POST", "Bearer internal-secret"));
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejects missing and incorrect secrets without running reconciliation", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    expect((await POST(request("POST"))).status).toBe(401);
    expect((await POST(request("POST", "Bearer wrong"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("authorizes the Vercel Cron GET trigger with the same secret", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    const response = await GET(request("GET", "Bearer internal-secret"));
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated GET without running reconciliation", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    expect((await GET(request("GET"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not expose the secret on success or structural failure", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    let response = await POST(request("POST", "Bearer internal-secret"));
    expect(await response.text()).not.toContain("internal-secret");
    run.mockRejectedValueOnce(new Error("private details"));
    response = await POST(request("POST", "Bearer internal-secret"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private details");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { run, reprice, trialReminders } = vi.hoisted(() => ({
  run: vi.fn(async () => []),
  reprice: vi.fn(async () => ({ checked: 2, repriced: 1, cancelled: 0, failed: 0 })),
  trialReminders: vi.fn(async () => ({ claimed: 2, sent: 2, failed: 0 })),
}));
vi.mock("@/lib/billing/reconciliation-runner", () => ({ runBoundedReconciliation: run }));
vi.mock("@/lib/billing/reprice-checkouts-runner", () => ({ runPendingCheckoutRepricing: reprice }));
vi.mock("@/lib/billing/trial-reminders", () => ({ runTrialReminders: trialReminders }));
vi.mock("@/lib/google-calendar/sync", () => ({ runGoogleCalendarSyncBatch: vi.fn(async () => null) }));
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

  // #219: no cache in front of the cron route may keep or replay an answer.
  it("answers no-store on success and on refusal", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    expect((await POST(request("POST", "Bearer internal-secret"))).headers.get("Cache-Control")).toBe("no-store");
    expect((await GET(request("GET"))).headers.get("Cache-Control")).toBe("no-store");
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

  it("reprices pending checkouts after reconciliation", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    const response = await POST(request("POST", "Bearer internal-secret"));
    expect(response.status).toBe(200);
    expect(reprice).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual(expect.objectContaining({
      repricing: { checked: 2, repriced: 1, cancelled: 0, failed: 0 },
    }));
  });

  it("still answers ok when the repricing fails", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    reprice.mockRejectedValueOnce(new Error("private details"));
    const response = await POST(request("POST", "Bearer internal-secret"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ ok: true, repricing: null }));
    expect(JSON.stringify(body)).not.toContain("private details");
  });

  it("sends the trial reminders and still answers ok when they fail", async () => {
    process.env.RECONCILIATION_CRON_SECRET = "internal-secret";
    let response = await POST(request("POST", "Bearer internal-secret"));
    expect(await response.json()).toEqual(expect.objectContaining({ trialReminders: { claimed: 2, sent: 2, failed: 0 } }));

    trialReminders.mockRejectedValueOnce(new Error("private details"));
    response = await POST(request("POST", "Bearer internal-secret"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ ok: true, trialReminders: null }));
    expect(JSON.stringify(body)).not.toContain("private details");
  });
});

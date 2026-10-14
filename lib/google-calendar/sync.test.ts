// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptGoogleToken } from "./oauth";
import { runGoogleCalendarSyncBatch, syncGoogleCalendarBooking, syncGoogleCalendarForBusiness } from "./sync";

describe("Google Calendar plan authorization", () => {
  let plan: string | null;
  let businessReadFails: boolean;
  let googleRequests: string[];

  beforeEach(() => {
    plan = "free";
    businessReadFails = false;
    googleRequests = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname === "www.googleapis.com") {
        googleRequests.push(url.href);
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith("/businesses")) {
        return Response.json(businessReadFails ? { message: "unavailable" } : { plan, timezone: "America/Sao_Paulo" }, { status: businessReadFails ? 400 : 200 });
      }
      if (url.pathname.endsWith("/google_calendar_connections")) {
        if (url.searchParams.has("order")) return Response.json(plan === "pro" ? [{ business_id: "business" }] : []);
        return Response.json({
          id: "connection", business_id: "business", calendar_id: "primary",
          access_token_ciphertext: encryptGoogleToken("test-token"),
          token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        });
      }
      if (url.pathname.endsWith("/bookings")) return Response.json(null);
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it.each(["free", null])("does not send customer data or use Google credentials for plan %s", async (value) => {
    plan = value;
    await syncGoogleCalendarBooking("business", "booking");
    expect(await syncGoogleCalendarForBusiness("business")).toEqual({ synced: 0, deleted: 0 });
    await runGoogleCalendarSyncBatch();
    expect(googleRequests).toEqual([]);
  });

  it("fails closed when the current plan cannot be read", async () => {
    businessReadFails = true;
    await expect(syncGoogleCalendarBooking("business", "booking")).rejects.toThrow();
    expect(googleRequests).toEqual([]);
  });

  it("still removes a missing booking from a professional calendar", async () => {
    plan = "pro";
    await syncGoogleCalendarBooking("business", "booking");
    expect(googleRequests).toHaveLength(1);
    expect(googleRequests[0]).toContain("/calendars/primary/events/");
  });
});

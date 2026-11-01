// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { decryptGoogleToken } from "@/lib/google-calendar/oauth";
import { flushAfterResponse } from "@/tests/mocks/after-response";

const { getCurrentBusiness, getUser, syncGoogleCalendarForBusiness } = vi.hoisted(() => ({
  getCurrentBusiness: vi.fn(),
  getUser: vi.fn(),
  syncGoogleCalendarForBusiness: vi.fn(),
}));

vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarForBusiness }));

import { GET } from "./route";

const STATE_COOKIE = "agendfined_google_calendar_oauth_state";

function callback(query: string, cookie: string | null = "business.expected-state") {
  return new NextRequest(`https://agenda.example/api/google-calendar/callback${query}`, {
    headers: cookie ? { cookie: `${STATE_COOKIE}=${cookie}` } : {},
  });
}

function calendarStatus(response: Response) {
  return new URL(response.headers.get("location")!).searchParams.get("calendar");
}

let tokenExchanges: URLSearchParams[];
let savedConnections: Record<string, unknown>[];
let existingConnections: Record<string, unknown>[];
let tokenResponse: Record<string, unknown>;
let profileEmail: string | undefined;

beforeEach(() => {
  tokenExchanges = [];
  savedConnections = [];
  existingConnections = [];
  tokenResponse = { access_token: "ya29.access", refresh_token: "1//refresh", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/calendar.events" };
  profileEmail = "dono@example.com";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://agenda.example/api/google-calendar/callback");
  vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
  getCurrentBusiness.mockResolvedValue({ id: "business", has_access: true });
  getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
  syncGoogleCalendarForBusiness.mockResolvedValue({ synced: 0, deleted: 0 });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.href === "https://oauth2.googleapis.com/token") {
      tokenExchanges.push(new URLSearchParams(String(init?.body)));
      return Response.json(tokenResponse);
    }
    if (url.hostname === "openidconnect.googleapis.com") return Response.json({ email: profileEmail });
    if (url.pathname.endsWith("/google_calendar_connections")) {
      if (init?.method === "POST") {
        savedConnections.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 201 });
      }
      return Response.json(existingConnections);
    }
    throw new Error(`Unexpected request: ${url.href}`);
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Google Calendar OAuth callback", () => {
  it.each([
    ["the state cookie is missing", "?state=expected-state&code=auth-code", null],
    ["the state differs from the cookie", "?state=forged-state&code=auth-code", "business.expected-state"],
    ["the state parameter is missing", "?code=auth-code", "business.expected-state"],
    ["the code is missing", "?state=expected-state", "business.expected-state"],
  ])("rejects the callback when %s", async (_label, query, cookie) => {
    const response = await GET(callback(query, cookie));

    expect(calendarStatus(response)).toBe("invalid_state");
    expect(tokenExchanges).toEqual([]);
    // #219: a rejected callback does not leave a usable state behind either.
    if (cookie) expect(response.headers.get("set-cookie")).toContain(`${STATE_COOKIE}=;`);
  });

  it("rejects a cookie without a state part", async () => {
    const response = await GET(callback("?state=&code=auth-code", "business."));

    expect(calendarStatus(response)).toBe("invalid_state");
    expect(tokenExchanges).toEqual([]);
  });

  it("redirects to the configured origin, not the request's Host", async () => {
    vi.stubEnv("APP_URL", "https://agendfined.example");

    const response = await GET(callback("?state=forged-state&code=auth-code"));

    expect(new URL(response.headers.get("location")!).origin).toBe("https://agendfined.example");
  });

  it("reports a cancelled consent when Google returns access_denied", async () => {
    const response = await GET(callback("?state=expected-state&error=access_denied"));

    expect(calendarStatus(response)).toBe("cancelled");
    expect(response.headers.get("set-cookie")).toContain(`${STATE_COOKIE}=;`);
    expect(tokenExchanges).toEqual([]);
  });

  it("does not trust an error from a callback whose state is forged", async () => {
    const response = await GET(callback("?state=forged-state&error=access_denied"));

    expect(calendarStatus(response)).toBe("invalid_state");
  });

  it("refuses to connect the calendar to a different business", async () => {
    getCurrentBusiness.mockResolvedValue({ id: "other-business", has_access: true });

    const response = await GET(callback("?state=expected-state&code=auth-code"));

    expect(calendarStatus(response)).toBe("unauthorized");
    expect(tokenExchanges).toEqual([]);
  });

  it("refuses to connect a suspended negócio", async () => {
    getCurrentBusiness.mockResolvedValue({ id: "business", has_access: false });

    const response = await GET(callback("?state=expected-state&code=auth-code"));

    expect(calendarStatus(response)).toBe("unauthorized");
    expect(tokenExchanges).toEqual([]);
  });

  it("stores only encrypted tokens and starts the first sync after the redirect", async () => {
    const response = await GET(callback("?state=expected-state&code=auth-code"));

    expect(calendarStatus(response)).toBe("connected");
    expect(response.headers.get("set-cookie")).toContain(`${STATE_COOKIE}=;`);
    expect(tokenExchanges[0].get("code")).toBe("auth-code");
    expect(tokenExchanges[0].get("redirect_uri")).toBe("https://agenda.example/api/google-calendar/callback");
    expect(savedConnections).toHaveLength(1);
    const saved = savedConnections[0];
    expect(saved).toMatchObject({ business_id: "business", google_email: "dono@example.com", calendar_id: "primary", last_error: null });
    expect(JSON.stringify(saved)).not.toMatch(/ya29\.access|1\/\/refresh/);
    expect(decryptGoogleToken(String(saved.access_token_ciphertext))).toBe("ya29.access");
    expect(decryptGoogleToken(String(saved.refresh_token_ciphertext))).toBe("1//refresh");
    expect(response.headers.get("location")).not.toContain("ya29");
    // #217: the first import can be hundreds of Google calls; the dono does not wait.
    expect(syncGoogleCalendarForBusiness).not.toHaveBeenCalled();
    await flushAfterResponse();
    expect(syncGoogleCalendarForBusiness).toHaveBeenCalledWith("business");
  });

  it("keeps the connection and logs it when the first sync fails after the redirect", async () => {
    syncGoogleCalendarForBusiness.mockRejectedValueOnce(new Error("quota exceeded"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(callback("?state=expected-state&code=auth-code"));
    await flushAfterResponse();

    expect(calendarStatus(response)).toBe("connected");
    expect(savedConnections).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith("google_calendar_initial_sync_failed", {
      businessId: "business",
      reason: "quota exceeded",
    });
    consoleError.mockRestore();
  });

  it("reports a failed connection when Google rejects the code", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));

    const response = await GET(callback("?state=expected-state&code=auth-code"));

    expect(calendarStatus(response)).toBe("connection_failed");
    expect(response.headers.get("set-cookie")).toContain(`${STATE_COOKIE}=;`);
    expect(savedConnections).toEqual([]);
  });

  it("clears the state when Google does not share the account e-mail", async () => {
    profileEmail = undefined;

    const response = await GET(callback("?state=expected-state&code=auth-code"));

    expect(calendarStatus(response)).toBe("missing_email");
    expect(response.headers.get("set-cookie")).toContain(`${STATE_COOKIE}=;`);
    expect(savedConnections).toEqual([]);
  });

  it("keeps the stored refresh token when the same account reconnects", async () => {
    delete tokenResponse.refresh_token;
    existingConnections = [{ google_email: "Dono@example.com", refresh_token_ciphertext: "stored-ciphertext" }];

    const response = await GET(callback("?state=expected-state&code=auth-code"));

    expect(calendarStatus(response)).toBe("connected");
    expect(savedConnections[0]).toMatchObject({ refresh_token_ciphertext: "stored-ciphertext" });
  });

  // O refresh token guardado é da conta anterior: reaproveitá-lo ligaria a
  // agenda de uma conta à conexão de outra.
  it("does not reuse the previous account's refresh token for a different account", async () => {
    delete tokenResponse.refresh_token;
    existingConnections = [{ google_email: "outra@example.com", refresh_token_ciphertext: "stored-ciphertext" }];

    const response = await GET(callback("?state=expected-state&code=auth-code"));

    expect(calendarStatus(response)).toBe("missing_refresh_token");
    expect(response.headers.get("set-cookie")).toContain(`${STATE_COOKIE}=;`);
    expect(savedConnections).toEqual([]);
  });
});

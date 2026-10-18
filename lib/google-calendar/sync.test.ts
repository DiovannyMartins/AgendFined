// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptGoogleToken, encryptGoogleToken } from "./oauth";
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

type FakeBooking = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  service_name_snapshot: string;
  customer_name_snapshot: string;
  customer_note: string | null;
};

type GoogleCall = { method: string; path: string; body: unknown };

function booking(id: string, status: string, overrides: Partial<FakeBooking> = {}): FakeBooking {
  return {
    id,
    status,
    start_at: new Date(Date.now() + 86_400_000).toISOString(),
    end_at: new Date(Date.now() + 86_400_000 + 3_600_000).toISOString(),
    service_name_snapshot: "Corte",
    customer_name_snapshot: "Ana",
    customer_note: null,
    ...overrides,
  };
}

function installGoogleCalendarFakes(options: {
  bookings?: FakeBooking[];
  tokenExpiresAt?: string;
  google?: (call: GoogleCall) => Response | undefined;
  tokenEndpoint?: () => Response;
} = {}) {
  const googleCalls: GoogleCall[] = [];
  const tokenRequests: URLSearchParams[] = [];
  const connectionUpdates: Record<string, unknown>[] = [];
  const bookings = options.bookings ?? [];

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
      tokenRequests.push(new URLSearchParams(String(init?.body ?? "")));
      return options.tokenEndpoint?.() ?? Response.json({ access_token: "renewed-token", expires_in: 3600 });
    }
    if (url.hostname === "www.googleapis.com") {
      const call = { method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
      googleCalls.push(call);
      const custom = options.google?.(call);
      if (custom) return custom;
      if (method === "GET") return Response.json({ timeZone: "America/Sao_Paulo" });
      if (method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({ id: "event" });
    }
    if (url.pathname.endsWith("/businesses")) return Response.json({ plan: "pro", timezone: "America/Sao_Paulo" });
    if (url.pathname.endsWith("/google_calendar_connections")) {
      if (method === "PATCH") {
        connectionUpdates.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      }
      return Response.json({
        id: "connection", business_id: "business", google_email: "dono@example.com", calendar_id: "primary",
        access_token_ciphertext: encryptGoogleToken("stored-access-token"),
        refresh_token_ciphertext: encryptGoogleToken("stored-refresh-token"),
        token_expires_at: options.tokenExpiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
        calendar_timezone: "America/Sao_Paulo",
      });
    }
    if (url.pathname.endsWith("/bookings")) {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const status = url.searchParams.get("status")?.replace(/^eq\./, "");
      return Response.json(bookings.filter(row => (!id || row.id === id) && (!status || row.status === status)));
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }));

  return { googleCalls, tokenRequests, connectionUpdates };
}

describe("Google Calendar sync of a booking", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://agenda.example/api/google-calendar/callback");
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it.each(["completed", "no_show"])("keeps the event of a %s booking in the owner's calendar", async (status) => {
    const fakes = installGoogleCalendarFakes({ bookings: [booking("booking", status)] });

    await syncGoogleCalendarBooking("business", "booking");

    expect(fakes.googleCalls).toEqual([]);
  });

  it("creates the event with POST when Google does not know it yet", async () => {
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("booking", "confirmed", { customer_note: "Primeira vez" })],
      google: call => call.method === "PUT" ? Response.json({ error: "notFound" }, { status: 404 }) : undefined,
    });

    await syncGoogleCalendarBooking("business", "booking");

    expect(fakes.googleCalls.map(call => call.method)).toEqual(["PUT", "POST"]);
    expect(fakes.googleCalls[1].path).toBe("/calendar/v3/calendars/primary/events");
    expect(fakes.googleCalls[1].body).toMatchObject({
      summary: "Corte — Ana",
      description: "Criado pelo AgendFined\nObservação: Primeira vez",
      start: { timeZone: "America/Sao_Paulo" },
      extendedProperties: { private: { agendfinedBookingId: "booking" } },
    });
  });

  it("updates an existing event in place with the booking's current time", async () => {
    const moved = booking("booking", "confirmed", { start_at: "2026-11-02T13:00:00.000Z", end_at: "2026-11-02T14:00:00.000Z" });
    const fakes = installGoogleCalendarFakes({ bookings: [moved] });

    await syncGoogleCalendarBooking("business", "booking");

    expect(fakes.googleCalls).toHaveLength(1);
    expect(fakes.googleCalls[0]).toMatchObject({
      method: "PUT",
      body: { start: { dateTime: "2026-11-02T13:00:00.000Z" }, end: { dateTime: "2026-11-02T14:00:00.000Z" } },
    });
  });

  it("removes the event of a cancelled booking", async () => {
    const fakes = installGoogleCalendarFakes({ bookings: [booking("booking", "cancelled")] });

    await syncGoogleCalendarBooking("business", "booking");

    expect(fakes.googleCalls).toHaveLength(1);
    expect(fakes.googleCalls[0].method).toBe("DELETE");
  });

  it("fails loudly and records last_error when Google rejects the update", async () => {
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("booking", "confirmed")],
      google: call => call.method === "PUT" ? Response.json({ error: "forbidden" }, { status: 403 }) : undefined,
    });

    await expect(syncGoogleCalendarBooking("business", "booking")).rejects.toThrow("GOOGLE_CALENDAR_EVENT_UPDATE_FAILED");
    expect(fakes.connectionUpdates).toEqual([{ last_error: "GOOGLE_CALENDAR_EVENT_UPDATE_FAILED" }]);
  });

  it("reconciles confirmed and cancelled bookings without touching completed ones", async () => {
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("upcoming", "confirmed"), booking("cancelled", "cancelled"), booking("done", "completed")],
    });

    expect(await syncGoogleCalendarForBusiness("business")).toEqual({ synced: 1, deleted: 1 });

    const eventCalls = fakes.googleCalls.filter(call => call.path.includes("/events"));
    expect(eventCalls.map(call => call.method)).toEqual(["PUT", "DELETE"]);
    expect(fakes.connectionUpdates.at(-1)).toMatchObject({ last_error: null });
  });
});

describe("Google Calendar access token", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://agenda.example/api/google-calendar/callback");
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("uses the stored token while it is valid for more than a minute", async () => {
    const fakes = installGoogleCalendarFakes({ bookings: [booking("booking", "confirmed")] });

    await syncGoogleCalendarBooking("business", "booking");

    expect(fakes.tokenRequests).toEqual([]);
  });

  it("renews the token when it expires in less than 60 seconds and stores it encrypted", async () => {
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("booking", "confirmed")],
      tokenExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    });

    await syncGoogleCalendarBooking("business", "booking");

    expect(fakes.tokenRequests).toHaveLength(1);
    expect(fakes.tokenRequests[0].get("grant_type")).toBe("refresh_token");
    expect(fakes.tokenRequests[0].get("refresh_token")).toBe("stored-refresh-token");
    const saved = fakes.connectionUpdates[0];
    expect(saved).toMatchObject({ last_error: null });
    expect(JSON.stringify(saved)).not.toContain("renewed-token");
    expect(decryptGoogleToken(String(saved.access_token_ciphertext))).toBe("renewed-token");
    const authorization = vi.mocked(fetch).mock.calls
      .filter(([input]) => new URL(String(input)).hostname === "www.googleapis.com")
      .map(([, init]) => (init?.headers as Record<string, string>).Authorization);
    expect(authorization).toEqual(["Bearer renewed-token"]);
  });

  it("records a renewal failure in last_error without calling the Calendar API", async () => {
    const fakes = installGoogleCalendarFakes({
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      tokenEndpoint: () => Response.json({ error: "invalid_grant" }, { status: 400 }),
    });

    await expect(syncGoogleCalendarForBusiness("business")).rejects.toThrow("GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED");

    expect(fakes.googleCalls).toEqual([]);
    expect(fakes.connectionUpdates).toEqual([{ last_error: "GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED" }]);
  });

  it("records a renewal failure in last_error when syncing a single booking", async () => {
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("booking", "confirmed")],
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      tokenEndpoint: () => Response.json({ error: "invalid_grant" }, { status: 400 }),
    });

    await expect(syncGoogleCalendarBooking("business", "booking")).rejects.toThrow("GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED");

    expect(fakes.googleCalls).toEqual([]);
    expect(fakes.connectionUpdates).toEqual([{ last_error: "GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED" }]);
  });
});

describe("Google Calendar token encryption", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("round-trips a token without leaving it readable", () => {
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));

    const ciphertext = encryptGoogleToken("ya29.secret-token");

    expect(ciphertext).not.toContain("secret-token");
    expect(encryptGoogleToken("ya29.secret-token")).not.toBe(ciphertext);
    expect(decryptGoogleToken(ciphertext)).toBe("ya29.secret-token");
  });

  it("refuses a ciphertext that was tampered with or encrypted with another key", () => {
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const ciphertext = encryptGoogleToken("ya29.secret-token");
    const [iv, tag, body] = ciphertext.split(".");

    const tampered = `${body[0] === "A" ? "B" : "A"}${body.slice(1)}`;
    expect(() => decryptGoogleToken(`${iv}.${tag}.${tampered}`)).toThrow();
    expect(() => decryptGoogleToken("not-a-ciphertext")).toThrow("GOOGLE_CALENDAR_TOKEN_CIPHERTEXT_INVALID");
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    expect(() => decryptGoogleToken(ciphertext)).toThrow();
  });

  it.each([
    ["missing", "", "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY_MISSING"],
    ["shorter than 32 bytes", Buffer.alloc(16, 1).toString("base64"), "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY_INVALID"],
  ])("refuses to encrypt when the key is %s", (_label, key, message) => {
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", key);

    expect(() => encryptGoogleToken("ya29.secret-token")).toThrow(message);
  });
});

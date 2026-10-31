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
  customer_phone_snapshot: string;
  customer_note: string | null;
  updated_at: string;
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
    customer_phone_snapshot: "51998765432",
    customer_note: null,
    updated_at: "2026-10-30T12:00:00+00:00",
    ...overrides,
  };
}

function installGoogleCalendarFakes(options: {
  bookings?: FakeBooking[];
  tokenExpiresAt?: string;
  google?: (call: GoogleCall) => Response | undefined | Promise<Response | undefined>;
  tokenEndpoint?: () => Response;
} = {}) {
  const googleCalls: GoogleCall[] = [];
  // Versão de cada reserva já enviada ao Google, como em google_calendar_booking_syncs.
  const syncedVersions = new Map<string, string>();
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
      const custom = await options.google?.(call);
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
    if (url.pathname.endsWith("/google_calendar_booking_syncs") && method === "POST") {
      for (const row of JSON.parse(String(init?.body)) as { booking_id: string; booking_updated_at: string }[]) {
        syncedVersions.set(row.booking_id, row.booking_updated_at);
      }
      return new Response(null, { status: 201 });
    }
    if (url.pathname.endsWith("/bookings")) {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const status = url.searchParams.get("status")?.replace(/^eq\./, "");
      return Response.json(bookings
        .filter(row => (!id || row.id === id) && (!status || row.status === status))
        .map(row => ({
          ...row,
          google_calendar_booking_syncs: syncedVersions.has(row.id)
            ? [{ connection_id: "connection", booking_updated_at: syncedVersions.get(row.id) }]
            : [],
        })));
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }));

  return { googleCalls, tokenRequests, connectionUpdates, syncedVersions };
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
      description: "Criado pelo AgendFined\nTelefone: (51) 99876-5432\nObservação: Primeira vez",
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

function delayedGoogle(delayMs: number) {
  const state = { inFlight: 0, maxInFlight: 0 };
  const handler = async (call: GoogleCall) => {
    if (call.method !== "PUT" && call.method !== "DELETE") return undefined;
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    state.inFlight -= 1;
    return undefined;
  };
  return { state, handler };
}

describe("Google Calendar incremental sync", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://agenda.example/api/google-calendar/callback");
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("does not call Google on a second run without changes", async () => {
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("upcoming", "confirmed"), booking("cancelled", "cancelled")],
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    expect(await syncGoogleCalendarForBusiness("business", { mode: "incremental" })).toEqual({ synced: 1, deleted: 1 });
    fakes.googleCalls.length = 0;
    fakes.tokenRequests.length = 0;

    expect(await syncGoogleCalendarForBusiness("business", { mode: "incremental" })).toEqual({ synced: 0, deleted: 0 });

    expect(fakes.googleCalls).toEqual([]);
    expect(fakes.tokenRequests).toEqual([]);
    expect(fakes.connectionUpdates.at(-1)).toMatchObject({ last_error: null });
  });

  it("resends only the booking that changed since it was last sent", async () => {
    const bookings = [booking("kept", "confirmed"), booking("moved", "confirmed")];
    const fakes = installGoogleCalendarFakes({ bookings });
    await syncGoogleCalendarForBusiness("business", { mode: "incremental" });
    fakes.googleCalls.length = 0;
    bookings[1].updated_at = "2026-10-31T09:00:00+00:00";

    expect(await syncGoogleCalendarForBusiness("business", { mode: "incremental" })).toEqual({ synced: 1, deleted: 0 });

    const eventCalls = fakes.googleCalls.filter(call => call.path.includes("/events"));
    expect(eventCalls).toHaveLength(1);
    expect(eventCalls[0].body).toMatchObject({ extendedProperties: { private: { agendfinedBookingId: "moved" } } });
    expect(fakes.syncedVersions.get("moved")).toBe("2026-10-31T09:00:00+00:00");
  });

  it("does not resend a booking already sent on its own", async () => {
    const fakes = installGoogleCalendarFakes({ bookings: [booking("booking", "confirmed")] });
    await syncGoogleCalendarBooking("business", "booking");
    fakes.googleCalls.length = 0;

    await syncGoogleCalendarForBusiness("business", { mode: "incremental" });

    expect(fakes.googleCalls).toEqual([]);
  });

  it("resends every booking on a full sync, as the manual sync does", async () => {
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("upcoming", "confirmed"), booking("cancelled", "cancelled")],
    });
    await syncGoogleCalendarForBusiness("business", { mode: "incremental" });
    fakes.googleCalls.length = 0;

    expect(await syncGoogleCalendarForBusiness("business")).toEqual({ synced: 1, deleted: 1 });

    expect(fakes.googleCalls.filter(call => call.path.includes("/events")).map(call => call.method)).toEqual(["PUT", "DELETE"]);
  });

  it("keeps at most five Google calls in flight", async () => {
    const google = delayedGoogle(5);
    const bookings = Array.from({ length: 12 }, (_, index) => booking(`booking-${index}`, index % 3 ? "confirmed" : "cancelled"));
    installGoogleCalendarFakes({ bookings, google: google.handler });

    expect(await syncGoogleCalendarForBusiness("business")).toEqual({ synced: 8, deleted: 4 });

    expect(google.state.maxInFlight).toBe(5);
  });

  it("keeps the bookings that reached Google when another one fails, and retries only the failed one", async () => {
    let rejectFailing = true;
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("first", "confirmed"), booking("failing", "confirmed"), booking("third", "confirmed")],
      google: call => rejectFailing && call.method === "PUT" && call.body && JSON.stringify(call.body).includes("\"failing\"")
        ? Response.json({ error: "forbidden" }, { status: 403 })
        : undefined,
    });

    await expect(syncGoogleCalendarForBusiness("business", { mode: "incremental" })).rejects.toThrow("GOOGLE_CALENDAR_EVENT_UPDATE_FAILED");
    expect([...fakes.syncedVersions.keys()].sort()).toEqual(["first", "third"]);
    expect(fakes.connectionUpdates.at(-1)).toEqual({ last_error: "GOOGLE_CALENDAR_EVENT_UPDATE_FAILED" });

    rejectFailing = false;
    fakes.googleCalls.length = 0;
    expect(await syncGoogleCalendarForBusiness("business", { mode: "incremental" })).toEqual({ synced: 1, deleted: 0 });
    expect(fakes.googleCalls.filter(call => call.path.includes("/events"))).toHaveLength(1);
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
      tokenEndpoint: () => Response.json({ error: "internal_failure" }, { status: 503 }),
    });

    await expect(syncGoogleCalendarForBusiness("business")).rejects.toThrow("GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED");

    expect(fakes.googleCalls).toEqual([]);
    expect(fakes.connectionUpdates).toEqual([{ last_error: "GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED" }]);
  });

  it("records a renewal failure in last_error when syncing a single booking", async () => {
    const fakes = installGoogleCalendarFakes({
      bookings: [booking("booking", "confirmed")],
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      tokenEndpoint: () => Response.json({ error: "internal_failure" }, { status: 503 }),
    });

    await expect(syncGoogleCalendarBooking("business", "booking")).rejects.toThrow("GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED");

    expect(fakes.googleCalls).toEqual([]);
    expect(fakes.connectionUpdates).toEqual([{ last_error: "GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED" }]);
  });

  // Uma autorização revogada ou expirada (app em modo Teste: 7 dias) nunca
  // volta sozinha; só reconectar resolve.
  it("asks for reconnection when Google revoked the authorization", async () => {
    const fakes = installGoogleCalendarFakes({
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      tokenEndpoint: () => Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 }),
    });

    await expect(syncGoogleCalendarForBusiness("business")).rejects.toThrow("GOOGLE_CALENDAR_REAUTH_REQUIRED");

    expect(fakes.googleCalls).toEqual([]);
    expect(fakes.connectionUpdates).toEqual([{ last_error: "GOOGLE_CALENDAR_REAUTH_REQUIRED" }]);
  });
});

describe("Google Calendar batch sync", () => {
  let renewals: number;

  beforeEach(() => {
    renewals = 0;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://agenda.example/api/google-calendar/callback");
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    const connections = [{ business_id: "business", last_error: "GOOGLE_CALENDAR_REAUTH_REQUIRED" }];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname === "oauth2.googleapis.com") {
        renewals += 1;
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      if (url.pathname.endsWith("/google_calendar_connections") && url.searchParams.has("order")) {
        // PostgREST applies the batch filter; a connection waiting for the
        // owner to reconnect only comes back when the batch does not exclude it.
        const excludesReauth = url.searchParams.get("or") === "(last_error.is.null,last_error.neq.GOOGLE_CALENDAR_REAUTH_REQUIRED)";
        return Response.json(excludesReauth ? connections.filter((row) => row.last_error !== "GOOGLE_CALENDAR_REAUTH_REQUIRED") : connections);
      }
      if (url.pathname.endsWith("/google_calendar_connections")) {
        return Response.json({
          id: "connection", business_id: "business", calendar_id: "primary",
          access_token_ciphertext: encryptGoogleToken("stored-access-token"),
          refresh_token_ciphertext: encryptGoogleToken("stored-refresh-token"),
          token_expires_at: new Date(Date.now() - 1_000).toISOString(),
        });
      }
      if (url.pathname.endsWith("/businesses")) return Response.json({ plan: "pro", timezone: "America/Sao_Paulo" });
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("skips a connection waiting for the owner to reconnect instead of failing every run", async () => {
    expect(await runGoogleCalendarSyncBatch()).toEqual({ connections: 0, synced: 0, deleted: 0, failed: 0 });
    expect(renewals).toBe(0);
  });
});

describe("Google Calendar batch concurrency", () => {
  const businesses = Array.from({ length: 8 }, (_, index) => `business-${index}`);
  let google: ReturnType<typeof delayedGoogle>;
  let eventCalls: number;

  beforeEach(() => {
    google = delayedGoogle(5);
    eventCalls = 0;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    const syncedVersions = new Map<string, string>();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? "GET").toUpperCase();
      const businessId = url.searchParams.get("business_id")?.replace(/^eq\./, "") ?? url.searchParams.get("id")?.replace(/^eq\./, "");
      if (url.hostname === "www.googleapis.com") {
        if (method === "GET") return Response.json({ timeZone: "America/Sao_Paulo" });
        eventCalls += 1;
        await google.handler({ method, path: url.pathname, body: null });
        return Response.json({ id: "event" });
      }
      if (url.pathname.endsWith("/google_calendar_connections")) {
        if (method === "PATCH") return new Response(null, { status: 204 });
        if (url.searchParams.has("order")) return Response.json(businesses.map(business_id => ({ business_id })));
        return Response.json({
          id: `${businessId}-connection`, business_id: businessId, google_email: "dono@example.com", calendar_id: "primary",
          access_token_ciphertext: encryptGoogleToken("stored-access-token"),
          refresh_token_ciphertext: encryptGoogleToken("stored-refresh-token"),
          token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          calendar_timezone: "America/Sao_Paulo",
        });
      }
      if (url.pathname.endsWith("/businesses")) return Response.json({ plan: "pro", timezone: "America/Sao_Paulo" });
      if (url.pathname.endsWith("/google_calendar_booking_syncs")) {
        for (const row of JSON.parse(String(init?.body)) as { booking_id: string; booking_updated_at: string }[]) {
          syncedVersions.set(row.booking_id, row.booking_updated_at);
        }
        return new Response(null, { status: 201 });
      }
      if (url.pathname.endsWith("/bookings")) {
        if (url.searchParams.get("status") !== "eq.confirmed") return Response.json([]);
        const row = booking(`${businessId}-booking`, "confirmed");
        const version = syncedVersions.get(row.id);
        return Response.json([{ ...row, google_calendar_booking_syncs: version ? [{ booking_updated_at: version }] : [] }]);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("syncs at most five businesses at a time and only sends what changed", async () => {
    expect(await runGoogleCalendarSyncBatch()).toEqual({ connections: 8, synced: 8, deleted: 0, failed: 0 });
    expect(google.state.maxInFlight).toBe(5);

    eventCalls = 0;
    expect(await runGoogleCalendarSyncBatch()).toEqual({ connections: 8, synced: 0, deleted: 0, failed: 0 });
    expect(eventCalls).toBe(0);
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

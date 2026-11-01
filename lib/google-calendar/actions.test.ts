// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptGoogleToken } from "./oauth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: async () => ({ id: "business", has_access: true }) }));
vi.mock("./sync", () => ({ syncGoogleCalendarForBusiness: vi.fn() }));

import { adoptGoogleCalendarTimezone, disconnectGoogleCalendar } from "./actions";

let hasConnection: boolean;
let revoke: () => Promise<Response>;
let revokedTokens: string[];
let deletedConnections: string[];
let calendarTimezone: string;
let businessUpdates: unknown[];

beforeEach(() => {
  hasConnection = true;
  revoke = async () => new Response(null, { status: 200 });
  revokedTokens = [];
  deletedConnections = [];
  calendarTimezone = "America/Sao_Paulo";
  businessUpdates = [];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
  vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 5).toString("base64"));
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.href === "https://oauth2.googleapis.com/revoke") {
      revokedTokens.push(new URLSearchParams(String(init?.body)).get("token")!);
      return revoke();
    }
    if (url.pathname.endsWith("/google_calendar_connections")) {
      if (init?.method === "DELETE") {
        deletedConnections.push(url.searchParams.get("id")!);
        return new Response(null, { status: 204 });
      }
      return Response.json(hasConnection
        ? [{ id: "connection", calendar_id: "primary", calendar_timezone: calendarTimezone, refresh_token_ciphertext: encryptGoogleToken("1//refresh-secret") }]
        : []);
    }
    if (url.pathname.endsWith("/bookings")) {
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    }
    if (url.pathname.endsWith("/businesses") && init?.method === "PATCH") {
      businessUpdates.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${url.href}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("disconnectGoogleCalendar", () => {
  it("revokes the refresh token at Google and removes the connection", async () => {
    const result = await disconnectGoogleCalendar({ ok: true });

    expect(revokedTokens).toEqual(["1//refresh-secret"]);
    expect(deletedConnections).toEqual(["eq.connection"]);
    expect(result).toEqual({ ok: true, message: "Google Calendar desconectado." });
  });

  it.each([
    ["Google rejects the revocation", async () => Response.json({ error: "invalid_token" }, { status: 400 })],
    ["Google cannot be reached", async () => { throw new TypeError("fetch failed"); }],
  ])("still removes the connection when %s", async (_label, failure) => {
    revoke = failure;

    const result = await disconnectGoogleCalendar({ ok: true });

    expect(deletedConnections).toEqual(["eq.connection"]);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("refresh-secret");
  });

  it("removes the connection even when the stored token can no longer be decrypted", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json([{ id: "connection", calendar_id: "primary", refresh_token_ciphertext: "corrupted" }]));

    const result = await disconnectGoogleCalendar({ ok: true });

    expect(revokedTokens).toEqual([]);
    expect(deletedConnections).toEqual(["eq.connection"]);
    expect(result.ok).toBe(true);
  });

  it("does nothing when the business has no connection", async () => {
    hasConnection = false;

    expect(await disconnectGoogleCalendar({ ok: true })).toEqual({ ok: true, message: "Nenhuma conexão encontrada." });
    expect(revokedTokens).toEqual([]);
    expect(deletedConnections).toEqual([]);
  });
});

// #189: phones are always Brazilian, so the negócio cannot follow a Google
// Calendar set to a fuso abroad.
describe("adoptGoogleCalendarTimezone", () => {
  it("refuses a Google Calendar fuso outside Brazil without touching the negócio", async () => {
    calendarTimezone = "Europe/Lisbon";

    const result = await adoptGoogleCalendarTimezone({ ok: true });

    expect(result).toEqual({
      ok: false,
      message: "O Google Calendar está no fuso Europe/Lisbon, fora do Brasil. O AgendFined só atende negócios em fusos brasileiros.",
    });
    expect(businessUpdates).toEqual([]);
  });

  it("adopts a Brazilian fuso, even one outside the dashboard's list", async () => {
    calendarTimezone = "America/Fortaleza";

    const result = await adoptGoogleCalendarTimezone({ ok: true });

    expect(result).toEqual({ ok: true, message: "Fuso do negócio alinhado ao Google Calendar." });
    expect(businessUpdates).toEqual([{ timezone: "America/Fortaleza" }]);
  });
});

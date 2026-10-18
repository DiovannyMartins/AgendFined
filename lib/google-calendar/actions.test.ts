// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptGoogleToken } from "./oauth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: async () => ({ id: "business", plan: "pro" }) }));
vi.mock("./sync", () => ({ syncGoogleCalendarForBusiness: vi.fn() }));

import { disconnectGoogleCalendar } from "./actions";

let hasConnection: boolean;
let revoke: () => Promise<Response>;
let revokedTokens: string[];
let deletedConnections: string[];

beforeEach(() => {
  hasConnection = true;
  revoke = async () => new Response(null, { status: 200 });
  revokedTokens = [];
  deletedConnections = [];
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
        ? [{ id: "connection", calendar_id: "primary", refresh_token_ciphertext: encryptGoogleToken("1//refresh-secret") }]
        : []);
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

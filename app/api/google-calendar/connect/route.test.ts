// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getCurrentBusiness } = vi.hoisted(() => ({ getCurrentBusiness: vi.fn() }));

vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness }));

import { GET } from "./route";

function connect() {
  return GET(new NextRequest("https://agenda.example/api/google-calendar/connect"));
}

function calendarStatus(response: Response) {
  return new URL(response.headers.get("location")!).searchParams.get("calendar");
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://agenda.example/api/google-calendar/callback");
  getCurrentBusiness.mockResolvedValue({ id: "business", has_access: true });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Google Calendar OAuth connect", () => {
  it("sends the owner to Google with the minimum calendar scope and a fresh state bound to the business", async () => {
    const response = await connect();

    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.events");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("redirect_uri")).toBe("https://agenda.example/api/google-calendar/callback");
    expect(location.searchParams.has("client_secret")).toBe(false);
    const state = location.searchParams.get("state")!;
    expect(state).toMatch(/^[0-9a-f]{64}$/);

    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain(`agendfined_google_calendar_oauth_state=business.${state}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain("Max-Age=600");

    const another = new URL((await connect()).headers.get("location")!).searchParams.get("state");
    expect(another).not.toBe(state);
  });

  it("asks a signed-out visitor to sign in", async () => {
    getCurrentBusiness.mockResolvedValue(null);

    expect(calendarStatus(await connect())).toBe("unauthorized");
  });

  it("asks a suspended negócio to subscribe without contacting Google", async () => {
    getCurrentBusiness.mockResolvedValue({ id: "business", has_access: false });

    const response = await connect();

    expect(calendarStatus(response)).toBe("access_required");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("reports a missing OAuth configuration", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "");

    const response = await connect();

    expect(calendarStatus(response)).toBe("not_configured");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

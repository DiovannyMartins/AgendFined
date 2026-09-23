import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { exchangeCodeForSession, verifyOtp } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { exchangeCodeForSession, verifyOtp } })),
}));

import { GET } from "./route";

function request(query = "") {
  return new NextRequest(`https://untrusted.example/auth/callback${query}`);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("authentication callback", () => {
  it("rejects a callback without credentials using the trusted origin", async () => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    const response = await GET(request());

    expect(response.headers.get("location")).toBe("https://agenda.example/login?error=auth");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects an incomplete OTP tuple", async () => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    const response = await GET(request("?token_hash=only-token"));

    expect(response.headers.get("location")).toBe("https://agenda.example/login?error=auth");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("exchanges a valid code and keeps a safe relative destination", async () => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(request("?code=pkce-code&next=/dashboard/configuracoes"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(response.headers.get("location")).toBe("https://agenda.example/dashboard/configuracoes");
  });
});

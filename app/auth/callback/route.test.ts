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

  it.each([
    ["?token_hash=only-token"],
    ["?token_hash=hash&type=signup"],
    ["?token_hash=hash&type=magiclink&next=/dashboard"],
    ["?token_hash=hash&type=recovery&next=/redefinir-senha"],
  ])("rejects a token_hash callback (%s) without verifying it", async (query) => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    const response = await GET(request(query));

    expect(response.headers.get("location")).toBe("https://agenda.example/login?error=auth");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchanges a valid code and keeps a safe relative destination", async () => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(request("?code=pkce-code&next=/dashboard/configuracoes"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(response.headers.get("location")).toBe("https://agenda.example/dashboard/configuracoes");
  });

  it("uses only the code when token_hash is also present", async () => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(request("?code=pkce-code&token_hash=hash&type=signup"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://agenda.example/dashboard");
  });

  it("redirects to login when the code exchange fails", async () => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid" } });
    const response = await GET(request("?code=bad-code&next=/dashboard"));

    expect(response.headers.get("location")).toBe("https://agenda.example/login?error=auth");
  });

  it.each([
    ["https://evil.example/x"],
    ["//evil.example/x"],
    ["/\\evil.example/x"],
    ["evil.example"],
  ])("falls back to /dashboard for an unsafe next (%s)", async (next) => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(request(`?code=pkce-code&next=${encodeURIComponent(next)}`));

    expect(response.headers.get("location")).toBe("https://agenda.example/dashboard");
  });
});

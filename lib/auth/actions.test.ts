import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase Auth is the external boundary: with CAPTCHA protection enabled it
// rejects password sign-in, sign-up and recovery calls that lack a captchaToken.
const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceAuthRateLimit: async () => true,
  enforceMfaRateLimit: async () => true,
  getClientIp: async () => "203.0.113.7",
}));
vi.mock("@/lib/security/audit", () => ({ auditSecurityEvent: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { login, requestPasswordReset, signup } = await import("./actions");

const INITIAL = { ok: true as const, data: undefined };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
});

describe("login", () => {
  it("sends the Turnstile token to Supabase Auth", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      login(INITIAL, form({ email: "dono@agendfined.dev", password: "Senha-forte-1", cfTurnstileToken: "tok-login" })),
    ).rejects.toThrow("REDIRECT:");

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "dono@agendfined.dev",
      password: "Senha-forte-1",
      options: { captchaToken: "tok-login" },
    });
  });
});

describe("login with a rejected CAPTCHA", () => {
  it("asks for the human verification again instead of blaming the password", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: "captcha_failed", message: "captcha protection: request disallowed" } });

    const result = await login(INITIAL, form({ email: "dono@agendfined.dev", password: "Senha-forte-1", cfTurnstileToken: "expired" }));

    expect(result).toMatchObject({ ok: false, code: "CAPTCHA_FAILED" });
  });
});

describe("signup", () => {
  it("sends the Turnstile token to Supabase Auth", async () => {
    auth.signUp.mockResolvedValue({ error: null });

    const result = await signup(
      INITIAL,
      form({ email: "novo@agendfined.dev", password: "Senha-forte-1", displayName: "Ana", cfTurnstileToken: "tok-signup" }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "novo@agendfined.dev",
      password: "Senha-forte-1",
      options: { data: { displayName: "Ana" }, captchaToken: "tok-signup" },
    });
  });
});

describe("requestPasswordReset", () => {
  it("sends the Turnstile token to Supabase Auth", async () => {
    vi.stubEnv("APP_URL", "https://agendfined.dev");
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await requestPasswordReset(INITIAL, form({ email: "dono@agendfined.dev", cfTurnstileToken: "tok-reset" }));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("dono@agendfined.dev", {
      redirectTo: "https://agendfined.dev/auth/callback?next=/redefinir-senha",
      captchaToken: "tok-reset",
    });
    vi.unstubAllEnvs();
  });
});

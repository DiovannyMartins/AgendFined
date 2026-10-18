import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase Auth is the external boundary: with CAPTCHA protection enabled it
// rejects password sign-in, sign-up and recovery calls that lack a captchaToken.
const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
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

const { login, requestPasswordReset, signup, updatePassword } = await import("./actions");

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

  it("returns the owner to the protected page they were sent away from", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      login(INITIAL, form({ email: "dono@agendfined.dev", password: "Senha-forte-1", next: "/dashboard/agenda" })),
    ).rejects.toThrow("REDIRECT:/dashboard/agenda?login=1");
  });

  it.each(["//evil.com", "https://evil.com/dashboard"])("ignores the external destination %s", async (next) => {
    auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      login(INITIAL, form({ email: "dono@agendfined.dev", password: "Senha-forte-1", next })),
    ).rejects.toThrow(/^REDIRECT:\/dashboard\?login=1$/);
  });

  it("keeps the destination through the MFA challenge", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    await expect(
      login(INITIAL, form({ email: "dono@agendfined.dev", password: "Senha-forte-1", next: "/dashboard/agenda" })),
    ).rejects.toThrow(/^REDIRECT:\/mfa\?next=%2Fdashboard%2Fagenda%3Flogin%3D1$/);
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
    vi.stubEnv("APP_URL", "https://agendfined.dev");
    auth.signUp.mockResolvedValue({ error: null });

    const result = await signup(
      INITIAL,
      form({ email: "novo@agendfined.dev", password: "Senha-forte-1", displayName: "Ana", cfTurnstileToken: "tok-signup" }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "novo@agendfined.dev",
      password: "Senha-forte-1",
      options: {
        data: { displayName: "Ana" },
        captchaToken: "tok-signup",
        emailRedirectTo: "https://agendfined.dev/auth/callback?next=/dashboard",
      },
    });
    vi.unstubAllEnvs();
  });
});

describe("signup confirmation link", () => {
  // Without emailRedirectTo, Supabase sends the user to the bare Site URL
  // (/?code=…), which never exchanges the code for a session (#87).
  it("lands on the dashboard through the auth callback of the trusted app origin", async () => {
    vi.stubEnv("APP_URL", "https://agendfined.com.br/");
    auth.signUp.mockResolvedValue({ error: null });

    await signup(INITIAL, form({ email: "novo@agendfined.dev", password: "Senha-forte-1", displayName: "Ana" }));

    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(
      "https://agendfined.com.br/auth/callback?next=/dashboard",
    );
    vi.unstubAllEnvs();
  });

  it("falls back to NEXT_PUBLIC_APP_URL when APP_URL is not set", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    auth.signUp.mockResolvedValue({ error: null });

    await signup(INITIAL, form({ email: "novo@agendfined.dev", password: "Senha-forte-1", displayName: "Ana" }));

    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(
      "http://localhost:3000/auth/callback?next=/dashboard",
    );
    vi.unstubAllEnvs();
  });
});

describe("signup with a password Supabase Auth considers weak", () => {
  it("reports the problem on the password field instead of the generic failure", async () => {
    auth.signUp.mockResolvedValue({
      error: { code: "weak_password", message: "Password should be at least 15 characters.", reasons: ["length"] },
    });

    const result = await signup(
      INITIAL,
      form({ email: "novo@agendfined.dev", password: "BetaTeste#2026", displayName: "Ana", cfTurnstileToken: "tok" }),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "WEAK_PASSWORD",
      fieldErrors: {
        password: [
          "Escolha uma senha com pelo menos 8 caracteres, uma letra maiúscula, uma letra minúscula, um número e um símbolo.",
        ],
      },
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

  it("points the recovery link at the new-password screen of the trusted app origin", async () => {
    vi.stubEnv("APP_URL", "https://agendfined.com.br/");
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    await requestPasswordReset(INITIAL, form({ email: "dono@agendfined.dev" }));

    expect(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo).toBe(
      "https://agendfined.com.br/auth/callback?next=/redefinir-senha",
    );
    vi.unstubAllEnvs();
  });
});

describe("updatePassword with a password Supabase Auth considers weak", () => {
  it("reports the problem on the password field instead of the generic failure", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { code: "weak_password", message: "Password should be at least 15 characters.", reasons: ["length"] },
    });

    const result = await updatePassword(INITIAL, form({ password: "BetaTeste#2026" }));

    expect(result).toMatchObject({
      ok: false,
      code: "WEAK_PASSWORD",
      fieldErrors: {
        password: [
          "Escolha uma senha com pelo menos 8 caracteres, uma letra maiúscula, uma letra minúscula, um número e um símbolo.",
        ],
      },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase Auth is the external boundary: with CAPTCHA protection enabled it
// rejects password sign-in, sign-up and recovery calls that lack a captchaToken.
const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  resend: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
  mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { enforceAuthRateLimit } = vi.hoisted(() => ({ enforceAuthRateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceAuthRateLimit,
  enforceMfaRateLimit: async () => true,
  getClientIp: async () => "203.0.113.7",
}));
const { auditSecurityEvent } = vi.hoisted(() => ({ auditSecurityEvent: vi.fn() }));
vi.mock("@/lib/security/audit", () => ({ auditSecurityEvent }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { login, requestPasswordReset, resendSignupConfirmation, signup, updatePassword } = await import("./actions");

const INITIAL = { ok: true as const, data: undefined };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "access-token" } }, error: null });
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

  // #128: o login=1 ia para depois do #, virando parte do fragmento.
  it("adds the login flag before the fragment of the destination", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      login(INITIAL, form({ email: "dono@agendfined.dev", password: "Senha-forte-1", next: "/dashboard/clientes?x=1#y" })),
    ).rejects.toThrow(/^REDIRECT:\/dashboard\/clientes\?x=1&login=1#y$/);
  });

  it("records who logged in in the audit event", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    await expect(
      login(INITIAL, form({ email: "dono@agendfined.dev", password: "Senha-forte-1" })),
    ).rejects.toThrow("REDIRECT:");

    expect(auditSecurityEvent).toHaveBeenCalledWith("auth.login", "user-1");
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

// #139: com confirmação de e-mail ligada, a senha certa de uma conta ainda não
// confirmada virava "E-mail ou senha incorretos.". O Supabase só devolve
// email_not_confirmed quando a senha confere, então a mensagem não enumera contas.
describe("login with an e-mail that was never confirmed", () => {
  it("asks to confirm the e-mail instead of blaming the password", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "email_not_confirmed", message: "Email not confirmed" },
    });

    const result = await login(INITIAL, form({ email: "dono@agendfined.dev", password: "Senha-forte-1" }));

    expect(result).toEqual({
      ok: false,
      code: "EMAIL_NOT_CONFIRMED",
      message: "Confirme seu e-mail para entrar.",
    });
  });

  it("still blames the credentials for any other rejection", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    const result = await login(INITIAL, form({ email: "dono@agendfined.dev", password: "senha-errada" }));

    expect(result).toMatchObject({ ok: false, code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos." });
  });
});

describe("resendSignupConfirmation", () => {
  const SENT = { ok: true, data: undefined };

  it("asks Supabase Auth for a new signup link that lands on the dashboard", async () => {
    vi.stubEnv("APP_URL", "https://agendfined.com.br");
    auth.resend.mockResolvedValue({ data: {}, error: null });

    const result = await resendSignupConfirmation(
      INITIAL,
      form({ email: " Dono@AgendFined.dev ", cfTurnstileToken: "tok-resend" }),
    );

    expect(result).toEqual(SENT);
    expect(auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "dono@agendfined.dev",
      options: {
        emailRedirectTo: "https://agendfined.com.br/auth/callback?next=/dashboard",
        captchaToken: "tok-resend",
      },
    });
    vi.unstubAllEnvs();
  });

  it("is limited per IP and per e-mail with its own AUTH_RATE_LIMIT entry", async () => {
    enforceAuthRateLimit.mockResolvedValueOnce(false);

    const result = await resendSignupConfirmation(INITIAL, form({ email: "dono@agendfined.dev" }));

    expect(result).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(enforceAuthRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "203.0.113.7",
      "confirmationResend",
      "dono@agendfined.dev",
    );
    expect(auth.resend).not.toHaveBeenCalled();
  });

  // Resposta uniforme: e-mail sem conta, conta já confirmada ou limite de envio
  // do próprio Supabase (por usuário) não podem ser distinguidos pela resposta.
  it.each([
    ["an e-mail without a pending signup", null],
    ["an already confirmed account", { code: "email_address_not_authorized", message: "x" }],
    ["Supabase's own per-user send limit", { code: "over_email_send_rate_limit", message: "x" }],
    ["an unexpected failure", { code: "unexpected_failure", message: "x" }],
  ])("answers the same way for %s", async (_, error) => {
    auth.resend.mockResolvedValue({ data: {}, error });

    const result = await resendSignupConfirmation(INITIAL, form({ email: "alguem@agendfined.dev" }));

    expect(result).toEqual(SENT);
  });

  it("asks for the human verification again when the CAPTCHA is rejected", async () => {
    auth.resend.mockResolvedValue({ data: {}, error: { code: "captcha_failed", message: "captcha protection" } });

    const result = await resendSignupConfirmation(INITIAL, form({ email: "dono@agendfined.dev", cfTurnstileToken: "old" }));

    expect(result).toMatchObject({ ok: false, code: "CAPTCHA_FAILED" });
  });

  it("rejects an invalid e-mail without calling Supabase Auth", async () => {
    const result = await resendSignupConfirmation(INITIAL, form({ email: "nao-e-email" }));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(auth.resend).not.toHaveBeenCalled();
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

// With e-mail confirmation on, Supabase Auth answers a confirmed address like
// a new one, but a pending signup resends its e-mail and hits max_frequency:
// that answer, and the ones only an existing address gets, look like success.
describe("signup for an address that may already have an account", () => {
  it.each(["over_email_send_rate_limit", "user_already_exists", "email_exists"])(
    "answers %s like a new signup",
    async (code) => {
      auth.signUp.mockResolvedValue({ error: { code, status: 429, message: "x" } });

      const result = await signup(
        INITIAL,
        form({ email: "novo@agendfined.dev", password: "Senha-forte-1", displayName: "Ana" }),
      );

      expect(result).toEqual({ ok: true, data: undefined });
    },
  );

  it("still reports a failure that does not depend on the address", async () => {
    auth.signUp.mockResolvedValue({ error: { code: "unexpected_failure", status: 500, message: "boom" } });

    const result = await signup(INITIAL, form({ email: "novo@agendfined.dev", password: "Senha-forte-1", displayName: "Ana" }));

    expect(result).toMatchObject({ ok: false, code: "SIGNUP_FAILED" });
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

  // Supabase Auth only throttles (max_frequency) and only errors for an
  // address that has an account, so every error but the CAPTCHA, which is
  // about the request, gets the success answer.
  it.each([
    ["the e-mail throttle", { code: "over_email_send_rate_limit", status: 429, message: "only request this after 50 seconds" }],
    ["an unexpected error", { code: "unexpected_failure", status: 500, message: "boom" }],
  ])("answers %s like a sent e-mail", async (_case, error) => {
    vi.stubEnv("APP_URL", "https://agendfined.dev");
    auth.resetPasswordForEmail.mockResolvedValue({ error });

    const result = await requestPasswordReset(INITIAL, form({ email: "dono@agendfined.dev" }));

    expect(result).toEqual({ ok: true, data: undefined });
    vi.unstubAllEnvs();
  });

  it("asks for the human verification again when the CAPTCHA is rejected", async () => {
    vi.stubEnv("APP_URL", "https://agendfined.dev");
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "captcha_failed", message: "captcha protection" } });

    const result = await requestPasswordReset(INITIAL, form({ email: "dono@agendfined.dev", cfTurnstileToken: "old" }));

    expect(result).toMatchObject({ ok: false, code: "CAPTCHA_FAILED" });
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

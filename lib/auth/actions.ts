"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, loginSchema, passwordSchema, signupSchema } from "@/lib/validation/schemas";
import { enforceAuthRateLimit, enforceMfaRateLimit, getClientIp } from "@/lib/booking/rate-limit";
import { auditSecurityEvent } from "@/lib/security/audit";
import { mfaChallengePath, requiresMfaChallenge, safeInternalPath } from "@/lib/auth/assurance";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]> };

const genericError = (message: string): { ok: false; code: string; message: string } => ({
  ok: false,
  code: "UNEXPECTED_ERROR",
  message,
});

const PASSWORD_POLICY_MESSAGE =
  "Escolha uma senha com pelo menos 8 caracteres, uma letra maiúscula, uma letra minúscula, um número e um símbolo.";

// The app checks the password policy before calling Supabase Auth, but Auth
// enforces its own copy (config.toml / dashboard). If they drift apart, point
// the user at the password field instead of failing generically.
function weakPasswordError(error: { code?: string }): ActionResult | null {
  if (error.code !== "weak_password") return null;
  return {
    ok: false,
    code: "WEAK_PASSWORD",
    message: "Revise os campos destacados.",
    fieldErrors: { password: [PASSWORD_POLICY_MESSAGE] },
  };
}

// Supabase Auth verifies the Turnstile token itself when CAPTCHA protection is
// enabled for the project; tokens are single-use, so the app never pre-verifies.
function captchaToken(formData: FormData): string | undefined {
  const token = String(formData.get("cfTurnstileToken") ?? "").trim();
  return token ? token.slice(0, 2048) : undefined;
}

async function authRateLimit(action: "login" | "signup" | "passwordReset", email: string) {
  try {
    const admin = createAdminClient();
    return await enforceAuthRateLimit(admin, await getClientIp(), action, email);
  } catch {
    return null;
  }
}

export async function signup(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const parsed = signupSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("displayName") ?? "").trim(),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const allowed = await authRateLimit("signup", parsed.data.email);
  if (allowed !== true) {
    return { ok: false, code: allowed === false ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE", message: "Muitas tentativas. Tente novamente mais tarde." };
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { displayName: parsed.data.displayName }, captchaToken: captchaToken(formData) },
  });

  if (error) {
    return weakPasswordError(error) ?? {
      ok: false,
      code: "SIGNUP_FAILED",
      message: "Não foi possível criar a conta. Verifique os dados e tente novamente.",
    };
  }

  auditSecurityEvent("auth.signup");
  return { ok: true, data: undefined };
}

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  const next = String(formData.get("next") ?? "/dashboard");

  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: "Preencha e-mail e senha.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const allowed = await authRateLimit("login", parsed.data.email);
  if (allowed !== true) {
    return { ok: false, code: allowed === false ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE", message: "Muitas tentativas. Tente novamente mais tarde." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    ...parsed.data,
    options: { captchaToken: captchaToken(formData) },
  });
  if (error) {
    auditSecurityEvent("auth.login_failed");
    if (error.code === "captcha_failed") {
      return { ok: false, code: "CAPTCHA_FAILED", message: "Verificação humana falhou. Tente novamente." };
    }
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "E-mail ou senha incorretos.",
    };
  }

  const safeNext = safeInternalPath(next);
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) return genericError("Não foi possível verificar a segurança da sessão.");
  auditSecurityEvent("auth.login");
  const separator = safeNext.includes("?") ? "&" : "?";
  const successfulLoginPath = `${safeNext}${separator}login=1`;
  redirect(
    requiresMfaChallenge(assurance)
      ? mfaChallengePath(successfulLoginPath)
      : successfulLoginPath,
  );
}

export async function logout() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  auditSecurityEvent("auth.logout", user?.id);
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const origin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success || !origin) {
    return { ok: false, code: "VALIDATION", message: "Informe um e-mail válido.", fieldErrors: {} };
  }

  const allowed = await authRateLimit("passwordReset", parsedEmail.data);
  if (allowed !== true) {
    return { ok: false, code: allowed === false ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE", message: "Muitas tentativas. Tente novamente mais tarde." };
  }

  // Route the recovery callback through the existing code-exchange handler so the
  // session is established before the new-password form renders (§24).
  const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
    redirectTo: `${origin}/auth/callback?next=/redefinir-senha`,
    captchaToken: captchaToken(formData),
  });

  if (error) {
    return genericError("Não foi possível enviar o e-mail de recuperação.");
  }

  auditSecurityEvent("auth.password_reset_requested");
  return { ok: true, data: undefined };
}

export async function updatePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const password = String(formData.get("password") ?? "");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, code: "UNAUTHORIZED", message: "Faça login novamente." };
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    return genericError("Não foi possível verificar a segurança da sessão.");
  }
  if (requiresMfaChallenge(assurance)) {
    return {
      ok: false,
      code: "MFA_REQUIRED",
      message: "Confirme seu autenticador antes de alterar a senha.",
    };
  }

  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: PASSWORD_POLICY_MESSAGE,
      fieldErrors: { password: parsedPassword.error.issues.map((issue) => issue.message) },
    };
  }

  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) {
    return weakPasswordError(error) ?? genericError("Não foi possível redefinir a senha.");
  }

  auditSecurityEvent("auth.password_changed", data.user.id);
  return { ok: true, data: undefined };
}

export async function beginTotpEnrollment(): Promise<ActionResult<{ factorId: string; qrCode: string; secret: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHORIZED", message: "Faça login novamente." };
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || requiresMfaChallenge(assurance)) {
    return { ok: false, code: "MFA_REQUIRED", message: "Confirme seu autenticador atual antes de adicionar outro." };
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) return genericError("Não foi possível iniciar a autenticação em duas etapas.");
  auditSecurityEvent("auth.mfa_enrollment_started", user.id);
  return { ok: true, data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
}

export async function verifyTotp(factorId: string, code: string): Promise<ActionResult> {
  if (!/^[0-9]{6}$/.test(code)) {
    return { ok: false, code: "VALIDATION", message: "Informe o código de 6 dígitos." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHORIZED", message: "Faça login novamente." };

  try {
    if (!await enforceMfaRateLimit(createAdminClient(), user.id)) {
      return { ok: false, code: "RATE_LIMITED", message: "Muitas tentativas. Aguarde alguns minutos." };
    }
  } catch {
    return { ok: false, code: "RATE_LIMIT_UNAVAILABLE", message: "Tente novamente mais tarde." };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) return genericError("Não foi possível validar o autenticador.");
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) {
    auditSecurityEvent("auth.mfa_verification_failed", user.id);
    return { ok: false, code: "INVALID_CODE", message: "Código inválido ou expirado." };
  }
  auditSecurityEvent("auth.mfa_verified", user.id);
  return { ok: true, data: undefined };
}

export async function removeTotp(factorId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHORIZED", message: "Faça login novamente." };
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== "aal2") {
    return { ok: false, code: "MFA_REQUIRED", message: "Confirme seu autenticador antes de removê-lo." };
  }
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError || !factors.totp.some((factor) => factor.id === factorId && factor.status === "verified")) {
    return { ok: false, code: "NOT_FOUND", message: "Autenticador não encontrado." };
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return genericError("Não foi possível remover o autenticador.");
  auditSecurityEvent("auth.mfa_removed", user.id);
  return { ok: true, data: undefined };
}

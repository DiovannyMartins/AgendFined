"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, loginSchema, passwordSchema, signupSchema } from "@/lib/validation/schemas";
import { enforceAuthRateLimit, enforceMfaRateLimit, getClientIp } from "@/lib/booking/rate-limit";
import { auditSecurityEvent } from "@/lib/security/audit";
import { mfaChallengePath, requiresMfaChallenge, safeInternalPath } from "@/lib/auth/assurance";
import {
  clearRecoveryCodes,
  consumeRecoveryCode,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  replaceRecoveryCodes,
} from "@/lib/auth/recovery-codes";
import { resolveAppOrigin } from "@/lib/app-origin";
import { sendMfaRecoveryUsedEmail } from "@/lib/email/mfa-recovery-used";

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

// Email links (signup confirmation, password recovery) must land on
// /auth/callback, the only route that exchanges the code for a session;
// otherwise Supabase falls back to the bare Site URL (#87). The origin comes
// from configuration, never from request headers.
function authCallbackUrl(next: string): string | undefined {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) return undefined;
  try {
    return `${new URL(configured).origin}/auth/callback?next=${next}`;
  } catch {
    return undefined;
  }
}

async function authRateLimit(
  action: "login" | "signup" | "passwordReset" | "confirmationResend",
  email: string,
) {
  try {
    const admin = createAdminClient();
    return await enforceAuthRateLimit(admin, await getClientIp(), action, email);
  } catch {
    return null;
  }
}

const ADDRESS_DEPENDENT_SIGNUP_ERRORS = new Set(["over_email_send_rate_limit", "user_already_exists", "email_exists"]);

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
    options: {
      data: { displayName: parsed.data.displayName },
      captchaToken: captchaToken(formData),
      emailRedirectTo: authCallbackUrl("/dashboard"),
    },
  });

  // With e-mail confirmation on, a confirmed address already gets the success
  // answer. A pending signup resends its e-mail and can hit the throttle, and
  // the "already exists" codes only come for an existing address: they all get
  // that same answer, so the form does not tell who has an account.
  if (error && !ADDRESS_DEPENDENT_SIGNUP_ERRORS.has(error.code ?? "")) {
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

  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    ...parsed.data,
    options: { captchaToken: captchaToken(formData) },
  });
  if (error) {
    auditSecurityEvent("auth.login_failed");
    if (error.code === "captcha_failed") {
      return { ok: false, code: "CAPTCHA_FAILED", message: "Verificação humana falhou. Tente novamente." };
    }
    // Supabase only reports email_not_confirmed after the password matched, so
    // telling it apart from wrong credentials does not enumerate accounts.
    if (error.code === "email_not_confirmed") {
      return { ok: false, code: "EMAIL_NOT_CONFIRMED", message: "Confirme seu e-mail para entrar." };
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
  auditSecurityEvent("auth.login", signIn?.user?.id);
  const successfulLoginPath = withLoginFlag(safeNext);
  redirect(
    requiresMfaChallenge(assurance)
      ? mfaChallengePath(successfulLoginPath)
      : successfulLoginPath,
  );
}

// Adds login=1 to the query string, before any #fragment: appended after it,
// the flag became part of the fragment and never reached the page.
function withLoginFlag(path: string): string {
  const hashIndex = path.indexOf("#");
  const beforeHash = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const separator = beforeHash.includes("?") ? "&" : "?";
  return `${beforeHash}${separator}login=1${hash}`;
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
  const redirectTo = authCallbackUrl("/redefinir-senha");

  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success || !redirectTo) {
    return { ok: false, code: "VALIDATION", message: "Informe um e-mail válido.", fieldErrors: {} };
  }

  const allowed = await authRateLimit("passwordReset", parsedEmail.data);
  if (allowed !== true) {
    return { ok: false, code: allowed === false ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE", message: "Muitas tentativas. Tente novamente mais tarde." };
  }

  // Route the recovery callback through the existing code-exchange handler so the
  // session is established before the new-password form renders (§24).
  const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
    redirectTo,
    captchaToken: captchaToken(formData),
  });

  // Supabase Auth only throttles, and so only errors, for an address that has
  // an account: every answer but a rejected CAPTCHA, which is about the
  // request and not the address, is the same as a sent e-mail.
  if (error?.code === "captcha_failed") {
    return { ok: false, code: "CAPTCHA_FAILED", message: "Verificação humana falhou. Tente novamente." };
  }
  if (error && error.code !== "over_email_send_rate_limit") {
    console.error("password_reset_email_failed", { code: error.code ?? "unknown", status: error.status });
  }

  auditSecurityEvent("auth.password_reset_requested");
  return { ok: true, data: undefined };
}

// Answers the same way whether the e-mail has a pending signup, an already
// confirmed account or no account at all; only a rejected CAPTCHA, which is
// about the request and not the address, gets its own answer.
export async function resendSignupConfirmation(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsedEmail = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsedEmail.success) {
    return { ok: false, code: "VALIDATION", message: "Informe um e-mail válido.", fieldErrors: {} };
  }

  const allowed = await authRateLimit("confirmationResend", parsedEmail.data);
  if (allowed !== true) {
    return { ok: false, code: allowed === false ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE", message: "Muitas tentativas. Tente novamente mais tarde." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsedEmail.data,
    options: {
      emailRedirectTo: authCallbackUrl("/dashboard"),
      captchaToken: captchaToken(formData),
    },
  });
  if (error?.code === "captcha_failed") {
    return { ok: false, code: "CAPTCHA_FAILED", message: "Verificação humana falhou. Tente novamente." };
  }

  auditSecurityEvent("auth.confirmation_resend_requested");
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
  // Without an authenticator the códigos de recuperação have nothing to
  // recover; a new activation generates new ones (#169).
  try {
    await clearRecoveryCodes(createAdminClient(), user.id);
  } catch {
    // Best effort: the next activation replaces whatever is left.
  }
  auditSecurityEvent("auth.mfa_removed", user.id);
  return { ok: true, data: undefined };
}

// Códigos de recuperação (#169, ADR 0009). Shown once, right after the
// authenticator is confirmed or when the dono asks for new ones; generating
// again replaces the previous set.
export async function generateMfaRecoveryCodes(): Promise<ActionResult<{ codes: string[] }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHORIZED", message: "Faça login novamente." };
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== "aal2") {
    return { ok: false, code: "MFA_REQUIRED", message: "Confirme seu autenticador antes de gerar os códigos." };
  }
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError || !factors.totp.some((factor) => factor.status === "verified")) {
    return { ok: false, code: "NOT_FOUND", message: "Ative um autenticador antes de gerar os códigos." };
  }

  const { codes, hashes } = generateRecoveryCodes(user.id);
  if (!await replaceRecoveryCodes(createAdminClient(), user.id, hashes)) {
    return genericError("Não foi possível gerar os códigos de recuperação.");
  }
  auditSecurityEvent("auth.mfa_recovery_codes_generated", user.id);
  return { ok: true, data: { codes } };
}

// The way out for a dono who lost the authenticator (#169): after the
// password, a código de recuperação switches the second factor off so the
// dono can activate a new one. It only answers the login challenge, and it
// shares the attempt limit with the authenticator code.
export async function redeemMfaRecoveryCode(input: string): Promise<ActionResult> {
  const code = normalizeRecoveryCode(input);
  if (!code) return { ok: false, code: "VALIDATION", message: "Informe o código de recuperação no formato XXXXX-XXXXX." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHORIZED", message: "Faça login novamente." };
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) return genericError("Não foi possível verificar a segurança da sessão.");
  if (!requiresMfaChallenge(assurance)) {
    return { ok: false, code: "MFA_NOT_REQUIRED", message: "Esta sessão não precisa de código de recuperação." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
    if (!await enforceMfaRateLimit(admin, user.id)) {
      return { ok: false, code: "RATE_LIMITED", message: "Muitas tentativas. Aguarde alguns minutos." };
    }
  } catch {
    return { ok: false, code: "RATE_LIMIT_UNAVAILABLE", message: "Tente novamente mais tarde." };
  }

  let consumed: boolean;
  try {
    consumed = await consumeRecoveryCode(admin, user.id, code);
  } catch {
    return genericError("Não foi possível validar o código de recuperação.");
  }
  if (!consumed) {
    auditSecurityEvent("auth.mfa_recovery_code_failed", user.id);
    return { ok: false, code: "INVALID_CODE", message: "Código de recuperação inválido ou já usado." };
  }

  // The code is spent before the factors go, so a failure here keeps the
  // remaining codes valid for another try.
  const { data: factors, error: factorsError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  const removed = !factorsError && (await Promise.all(
    factors.factors.map((factor) => admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id })),
  )).every((result) => !result.error);
  if (!removed) {
    return genericError("Não foi possível desativar o autenticador. Tente outro código de recuperação.");
  }

  // The assurance level reads the factors from the user stored in the session
  // cookie; without a refresh the session would still ask for aal2 and block
  // the new activation. A failed refresh only means signing in again.
  await supabase.auth.refreshSession().catch(() => undefined);
  await clearRecoveryCodes(admin, user.id).catch(() => false);
  if (user.email) {
    await sendMfaRecoveryUsedEmail({
      ownerEmail: user.email,
      mfaUrl: new URL("/mfa", resolveAppOrigin()).toString(),
    }).catch(() => undefined);
  }
  auditSecurityEvent("auth.mfa_recovery_code_used", user.id);
  return { ok: true, data: undefined };
}

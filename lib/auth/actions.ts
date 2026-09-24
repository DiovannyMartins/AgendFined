"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, loginSchema, signupSchema } from "@/lib/validation/schemas";
import { enforceAuthRateLimit, getClientIp } from "@/lib/booking/rate-limit";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]> };

const genericError = (message: string): { ok: false; code: string; message: string } => ({
  ok: false,
  code: "UNEXPECTED_ERROR",
  message,
});

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
    options: { data: { displayName: parsed.data.displayName } },
  });

  if (error) {
    return {
      ok: false,
      code: "SIGNUP_FAILED",
      message: "Não foi possível criar a conta. Verifique os dados e tente novamente.",
    };
  }

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

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "E-mail ou senha incorretos.",
    };
  }

  // Only allow same-origin, non-protocol-relative paths to avoid open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
  redirect(safeNext);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
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
  });

  if (error) {
    return genericError("Não foi possível enviar o e-mail de recuperação.");
  }

  return { ok: true, data: undefined };
}

export async function updatePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const password = String(formData.get("password") ?? "");

  if (password.length < 8 || password.length > 128) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "A senha deve ter pelo menos 8 caracteres.",
      fieldErrors: { password: ["A senha deve ter pelo menos 8 caracteres."] },
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return genericError("Não foi possível redefinir a senha.");
  }

  return { ok: true, data: undefined };
}

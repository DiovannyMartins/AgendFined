"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, enforceInterestRateLimit } from "@/lib/booking/rate-limit";
import { verifyTurnstile } from "@/lib/booking/anti-bot";
import { auditSecurityEvent } from "@/lib/security/audit";
import { sendInterestSubmissionEmails } from "@/lib/email/interest";
import { emailSchema } from "@/lib/validation/schemas";
import { z } from "zod";

export type InterestActionResult =
  | { ok: true; data: undefined }
  | { ok: false; code: string; message: string };

const interestSchema = z.object({
  email: emailSchema,
  consent: z.boolean().refine(Boolean, "Autorize o contato para continuar."),
  website: z.string().max(0).optional(),
  cfTurnstileToken: z.string().optional(),
});

export async function submitInterest(
  _previous: InterestActionResult,
  formData: FormData,
): Promise<InterestActionResult> {
  const parsed = interestSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    consent: formData.get("consent") === "on",
    website: String(formData.get("website") ?? ""),
    cfTurnstileToken: String(formData.get("cfTurnstileToken") ?? "") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: "Informe um e-mail válido e autorize o contato." };
  }

  // Quietly accept the honeypot path so automated submissions do not learn
  // which field triggered the rejection or receive an email response.
  if (parsed.data.website) return { ok: true, data: undefined };

  let ip: string;
  try {
    ip = await getClientIp();
    if (!await enforceInterestRateLimit(createAdminClient(), ip, parsed.data.email)) {
      return { ok: false, code: "RATE_LIMITED", message: "Muitas tentativas. Tente novamente mais tarde." };
    }
  } catch {
    return { ok: false, code: "RATE_LIMIT_UNAVAILABLE", message: "Não foi possível processar agora. Tente novamente mais tarde." };
  }

  const turnstile = await verifyTurnstile(parsed.data.cfTurnstileToken, {
    expectedAction: "interest_signup",
    remoteIp: ip,
  });
  if (!turnstile.ok) {
    return { ok: false, code: "ANTI_BOT", message: "Conclua a verificação para continuar." };
  }

  const result = await sendInterestSubmissionEmails(parsed.data.email);
  if (!result.sent) {
    return {
      ok: false,
      code: result.reason === "not_configured" ? "EMAIL_NOT_CONFIGURED" : "EMAIL_PROVIDER_ERROR",
      message: "Não foi possível enviar sua inscrição agora. Tente novamente mais tarde.",
    };
  }

  auditSecurityEvent("marketing.interest_signup");
  return { ok: true, data: undefined };
}

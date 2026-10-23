import "server-only";

import { resolveAppOrigin } from "@/lib/app-origin";
import { sendPaymentFailedEmail } from "@/lib/email/payment-failed";
import { formatDate } from "@/lib/format/when";
import type { createAdminClient } from "@/lib/supabase/admin";

// Tells the dono that the assinatura entered the carência because a charge
// failed (issue #151). Best effort, like the e-mails about reservas: nothing
// here ever throws, so a failure never makes the webhook retry; it is only
// logged, without the dono's e-mail.
export async function notifyPaymentFailed(
  admin: ReturnType<typeof createAdminClient>,
  input: { businessId: string; gracePeriodEnd: string },
): Promise<void> {
  const logFailure = (reason: string) =>
    console.error("payment_failed_email_failed", { businessId: input.businessId, reason });

  try {
    const { data: business, error } = await admin
      .from("businesses")
      .select("name, owner_id, timezone")
      .eq("id", input.businessId)
      .maybeSingle();
    if (error || !business) return logFailure("business_not_found");

    const { data } = await admin.auth.admin.getUserById(business.owner_id);
    const ownerEmail = data.user?.email;
    if (!ownerEmail) return logFailure("owner_email_not_found");

    const result = await sendPaymentFailedEmail({
      ownerEmail,
      businessName: business.name,
      activeUntil: formatDate(input.gracePeriodEnd, business.timezone),
      planUrl: new URL("/dashboard/configuracoes#plano", resolveAppOrigin()).toString(),
    });
    if (!result.sent) logFailure(result.reason);
  } catch {
    logFailure("unexpected_error");
  }
}

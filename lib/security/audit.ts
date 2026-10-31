import "server-only";
import { after } from "next/server";
import { sendSecurityLog } from "@/lib/security/betterstack";

type SecurityEvent =
  | "auth.signup"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_reset_requested"
  | "auth.confirmation_resend_requested"
  | "auth.password_changed"
  | "auth.mfa_enrollment_started"
  | "auth.mfa_verified"
  | "auth.mfa_verification_failed"
  | "auth.mfa_out_of_band_blocked"
  | "auth.mfa_removed"
  | "auth.mfa_recovery_codes_generated"
  | "auth.mfa_recovery_code_used"
  | "auth.mfa_recovery_code_failed";

// Never include credentials, codes, QR secrets, emails, or full request URLs.
export function auditSecurityEvent(
  event: SecurityEvent,
  actorId?: string,
  details: Record<string, string> = {},
) {
  const entry = { event, actorId: actorId ?? null, ...details, at: new Date().toISOString() };
  console.info(JSON.stringify(entry));
  after(() => sendSecurityLog(entry));
}

import "server-only";
import { after } from "next/server";
import { sendSecurityLog } from "@/lib/security/betterstack";

type SecurityEvent =
  | "auth.signup"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_reset_requested"
  | "auth.password_changed"
  | "auth.mfa_enrollment_started"
  | "auth.mfa_verified"
  | "auth.mfa_verification_failed"
  | "auth.mfa_removed"
  | "team.member_role_set"
  | "team.member_removed";

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

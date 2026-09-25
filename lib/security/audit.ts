import "server-only";

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
  | "auth.mfa_removed";

// Structured stdout is collected by Vercel and can be sent to Better Stack
// using a Log Drain. Never include credentials, codes, QR secrets, or emails.
export function auditSecurityEvent(event: SecurityEvent, actorId?: string) {
  console.info(JSON.stringify({ event, actorId: actorId ?? null, at: new Date().toISOString() }));
}

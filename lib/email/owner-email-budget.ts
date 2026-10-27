import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceOwnerEmailRateLimit, type OwnerEmailKind } from "@/lib/booking/rate-limit";

// Whether an action of the dono may e-mail the cliente now, spending one e-mail
// of the negócio's budget. Never throws: when the counter is unavailable the
// e-mail is skipped (fail closed) and the action itself goes on.
export async function spendOwnerEmail(businessId: string, kind: OwnerEmailKind): Promise<boolean> {
  try {
    return await enforceOwnerEmailRateLimit(createAdminClient(), businessId, kind);
  } catch (error) {
    console.error("owner_email_rate_limit_failed", {
      businessId,
      kind,
      // A PostgrestError is a plain object, not an Error.
      reason: String((error as { message?: unknown } | null)?.message ?? "unknown"),
    });
    return false;
  }
}

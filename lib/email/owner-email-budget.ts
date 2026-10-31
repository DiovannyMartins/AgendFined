import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceOwnerEmailRateLimit, type OwnerEmailKind } from "@/lib/booking/rate-limit";

// Whether an action of the dono may e-mail the cliente now, spending one e-mail
// of the dono's budget and one of the address's daily cap. Never throws: when
// the counter is unavailable the e-mail is skipped (fail closed) and the action
// itself goes on.
export async function spendOwnerEmail(
  business: { id: string; owner_id: string },
  recipientEmail: string,
  kind: OwnerEmailKind,
): Promise<boolean> {
  try {
    return await enforceOwnerEmailRateLimit(
      createAdminClient(),
      { businessId: business.id, ownerId: business.owner_id, recipientEmail },
      kind,
    );
  } catch (error) {
    console.error("owner_email_rate_limit_failed", {
      businessId: business.id,
      kind,
      // A PostgrestError is a plain object, not an Error.
      reason: String((error as { message?: unknown } | null)?.message ?? "unknown"),
    });
    return false;
  }
}

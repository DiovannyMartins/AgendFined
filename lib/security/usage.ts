import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enforceAiRateLimit } from "@/lib/booking/rate-limit";

export type AiCategory = "waitlistPriority" | "reportInsight";

export async function prepareAiBudget(
  userId: string,
  businessId: string,
  category: AiCategory,
): Promise<boolean> {
  if (!process.env.TYPESAFE_API_KEY?.trim()) return false;
  try {
    const admin = createAdminClient();
    const allowedByWindow = await enforceAiRateLimit(admin, userId, businessId, category);
    if (!allowedByWindow) return false;
    const { data, error } = await admin.rpc("consume_security_usage_budget", {
      p_subject_id: userId,
      p_category: `ai_${category}`,
      p_request_limit: 50,
      p_token_limit: 50_000,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function recordAiUsage(
  userId: string,
  category: AiCategory,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.rpc("record_security_usage", {
      p_subject_id: userId,
      p_category: `ai_${category}`,
      p_input_tokens: usage.inputTokens,
      p_output_tokens: usage.outputTokens,
    });
  } catch {
    // Usage accounting must never turn an otherwise safe dashboard read into a 500.
  }
}

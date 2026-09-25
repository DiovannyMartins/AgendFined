import { NextResponse, type NextRequest } from "next/server";
import { syncCurrentSubscriptionAfterReturn } from "@/lib/billing/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceApiRateLimit, getClientIpFromHeaders } from "@/lib/booking/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const allowed = await enforceApiRateLimit(createAdminClient(), getClientIpFromHeaders(request.headers), "billingReturn");
    if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "rate_limit_unavailable" }, { status: 503 });
  }
  try {
    await syncCurrentSubscriptionAfterReturn();
  } catch {
    // The webhook/reconciliation jobs remain authoritative if the provider is
    // temporarily unavailable while the payer is being redirected back.
  }

  return NextResponse.redirect(new URL("/dashboard/configuracoes", request.url));
}

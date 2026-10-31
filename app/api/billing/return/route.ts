import { NextResponse, type NextRequest } from "next/server";
import { syncCurrentSubscriptionAfterReturn } from "@/lib/billing/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceApiRateLimit, getClientIpFromHeaders } from "@/lib/booking/rate-limit";
import { trustedAppOrigin } from "@/lib/app-origin";
import { withNoStore } from "@/lib/http/no-store";

export const GET = withNoStore(async (request: NextRequest) => {
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

  // Back to the origin the checkout was opened from (APP_URL, like the
  // back_url), not the request's Host: another origin has another session.
  return NextResponse.redirect(new URL("/dashboard/configuracoes", trustedAppOrigin(request.nextUrl.origin)));
});

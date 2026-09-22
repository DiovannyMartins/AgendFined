import { NextResponse, type NextRequest } from "next/server";
import { syncCurrentSubscriptionAfterReturn } from "@/lib/billing/actions";

export async function GET(request: NextRequest) {
  try {
    await syncCurrentSubscriptionAfterReturn();
  } catch {
    // The webhook/reconciliation jobs remain authoritative if the provider is
    // temporarily unavailable while the payer is being redirected back.
  }

  return NextResponse.redirect(new URL("/dashboard/configuracoes", request.url));
}

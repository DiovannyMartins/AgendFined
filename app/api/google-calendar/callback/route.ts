import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusiness } from "@/lib/business/queries";
import { hasAccess } from "@/lib/plan/access";
import {
  encryptGoogleToken,
  exchangeGoogleAuthorizationCode,
  getGoogleUserInfo,
  GOOGLE_CALENDAR_SCOPE,
} from "@/lib/google-calendar/oauth";
import { syncGoogleCalendarForBusiness } from "@/lib/google-calendar/sync";
import { runAfterResponse } from "@/lib/after-response";
import type { GoogleCalendarCallbackStatus } from "@/lib/google-calendar/callback-status";
import { trustedAppOrigin } from "@/lib/app-origin";
import { constantTimeEqual } from "@/lib/security/constant-time";

export const runtime = "nodejs";

const STATE_COOKIE = "agendfined_google_calendar_oauth_state";

// Every answer clears the state, so one authorization is never replayed and a
// rejected callback does not leave a usable state behind (#219). The redirect
// goes to the configured origin, not the request's Host.
function finish(request: NextRequest, status: GoogleCalendarCallbackStatus) {
  const destination = new URL("/dashboard/configuracoes", trustedAppOrigin(request.nextUrl.origin));
  destination.searchParams.set("calendar", status);
  const response = NextResponse.redirect(destination);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const stateCookie = request.cookies.get(STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state");
  if (!stateCookie || !state) return finish(request, "invalid_state");
  const [businessId, expectedState] = stateCookie.split(".");
  if (!businessId || !expectedState || !constantTimeEqual(state, expectedState)) {
    return finish(request, "invalid_state");
  }
  // Google answers a denied consent with ?error=access_denied and no code.
  if (request.nextUrl.searchParams.get("error")) return finish(request, "cancelled");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return finish(request, "invalid_state");

  const business = await getCurrentBusiness();
  if (!business || business.id !== businessId || !hasAccess(business)) return finish(request, "unauthorized");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return finish(request, "unauthorized");

  try {
    const tokens = await exchangeGoogleAuthorizationCode(code);
    const profile = await getGoogleUserInfo(tokens.access_token);
    if (!profile.email) return finish(request, "missing_email");

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("google_calendar_connections")
      .select("google_email, refresh_token_ciphertext")
      .eq("business_id", business.id)
      .maybeSingle();
    // Google omits the refresh token when the account already granted access.
    // The stored one is reused only for that same account: it would act on the
    // previous account's calendar.
    const sameAccount = existing?.google_email?.toLowerCase() === profile.email.toLowerCase();
    const refreshToken = tokens.refresh_token
      ? encryptGoogleToken(tokens.refresh_token)
      : sameAccount ? existing?.refresh_token_ciphertext : undefined;
    if (!refreshToken) return finish(request, "missing_refresh_token");

    const { error } = await admin.from("google_calendar_connections").upsert({
      business_id: business.id,
      google_email: profile.email,
      calendar_id: "primary",
      access_token_ciphertext: encryptGoogleToken(tokens.access_token),
      refresh_token_ciphertext: refreshToken,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? GOOGLE_CALENDAR_SCOPE,
      last_error: null,
    }, { onConflict: "business_id" });
    if (error) throw new Error("GOOGLE_CALENDAR_CONNECTION_SAVE_FAILED");

    // The first import can take hundreds of Google calls, so it runs after the
    // redirect (#217). The connection is valid even if it needs a manual retry.
    const businessId = business.id;
    runAfterResponse("google_calendar_initial_sync_failed", { businessId }, () =>
      syncGoogleCalendarForBusiness(businessId),
    );
    return finish(request, "connected");
  } catch {
    return finish(request, "connection_failed");
  }
}

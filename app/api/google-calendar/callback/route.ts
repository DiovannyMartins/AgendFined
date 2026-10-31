import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentBusiness } from "@/lib/business/queries";
import { isProPlan } from "@/lib/plan/plan";
import {
  encryptGoogleToken,
  exchangeGoogleAuthorizationCode,
  getGoogleUserInfo,
  GOOGLE_CALENDAR_SCOPE,
} from "@/lib/google-calendar/oauth";
import { syncGoogleCalendarForBusiness } from "@/lib/google-calendar/sync";
import { runAfterResponse } from "@/lib/after-response";
import type { GoogleCalendarCallbackStatus } from "@/lib/google-calendar/callback-status";

export const runtime = "nodejs";

function settingsRedirect(request: NextRequest, status: GoogleCalendarCallbackStatus) {
  const destination = new URL("/dashboard/configuracoes", request.url);
  destination.searchParams.set("calendar", status);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  const stateCookie = request.cookies.get("agendfined_google_calendar_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  if (!stateCookie || !state) return settingsRedirect(request, "invalid_state");
  const [businessId, expectedState] = stateCookie.split(".");
  if (!businessId || state !== expectedState) return settingsRedirect(request, "invalid_state");
  // Google answers a denied consent with ?error=access_denied and no code.
  if (request.nextUrl.searchParams.get("error")) {
    const cancelled = settingsRedirect(request, "cancelled");
    cancelled.cookies.delete("agendfined_google_calendar_oauth_state");
    return cancelled;
  }
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return settingsRedirect(request, "invalid_state");

  // From here on the state has been used: every answer clears it, so the same
  // authorization cannot be replayed.
  const finish = (status: GoogleCalendarCallbackStatus) => {
    const response = settingsRedirect(request, status);
    response.cookies.delete("agendfined_google_calendar_oauth_state");
    return response;
  };

  const business = await getCurrentBusiness();
  if (!business || business.id !== businessId || !isProPlan(business.plan)) return finish("unauthorized");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return finish("unauthorized");

  try {
    const tokens = await exchangeGoogleAuthorizationCode(code);
    const profile = await getGoogleUserInfo(tokens.access_token);
    if (!profile.email) return finish("missing_email");

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
    if (!refreshToken) return finish("missing_refresh_token");

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
    return finish("connected");
  } catch {
    return finish("connection_failed");
  }
}

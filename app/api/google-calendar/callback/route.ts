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

export const runtime = "nodejs";

function settingsRedirect(request: NextRequest, status: string) {
  const destination = new URL("/dashboard/configuracoes", request.url);
  destination.searchParams.set("calendar", status);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  const stateCookie = request.cookies.get("agendfined_google_calendar_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!stateCookie || !state || !code) return settingsRedirect(request, "invalid_state");
  const [businessId, expectedState] = stateCookie.split(".");
  if (!businessId || state !== expectedState) return settingsRedirect(request, "invalid_state");
  if (request.nextUrl.searchParams.get("error")) return settingsRedirect(request, "cancelled");

  const business = await getCurrentBusiness();
  if (!business || business.id !== businessId || !isProPlan(business.plan)) return settingsRedirect(request, "unauthorized");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return settingsRedirect(request, "unauthorized");

  const response = settingsRedirect(request, "connected");
  response.cookies.delete("agendfined_google_calendar_oauth_state");

  try {
    const tokens = await exchangeGoogleAuthorizationCode(code);
    const profile = await getGoogleUserInfo(tokens.access_token);
    if (!profile.email) return settingsRedirect(request, "missing_email");

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("google_calendar_connections")
      .select("refresh_token_ciphertext")
      .eq("business_id", business.id)
      .maybeSingle();
    const refreshToken = tokens.refresh_token
      ? encryptGoogleToken(tokens.refresh_token)
      : existing?.refresh_token_ciphertext;
    if (!refreshToken) return settingsRedirect(request, "missing_refresh_token");

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

    try {
      await syncGoogleCalendarForBusiness(business.id);
    } catch {
      // The connection is valid even if the first import needs a manual retry.
    }
    return response;
  } catch {
    return settingsRedirect(request, "connection_failed");
  }
}

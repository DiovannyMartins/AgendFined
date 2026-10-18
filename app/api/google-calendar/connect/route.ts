import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { isProPlan } from "@/lib/plan/plan";
import { buildGoogleCalendarAuthorizationUrl } from "@/lib/google-calendar/oauth";
import type { GoogleCalendarCallbackStatus } from "@/lib/google-calendar/callback-status";

export const runtime = "nodejs";

function settingsRedirect(request: NextRequest, status: GoogleCalendarCallbackStatus) {
  const destination = new URL("/dashboard/configuracoes", request.url);
  destination.searchParams.set("calendar", status);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return settingsRedirect(request, "unauthorized");
  if (!isProPlan(business.plan)) return settingsRedirect(request, "upgrade_required");

  const state = randomBytes(32).toString("hex");
  try {
    const response = NextResponse.redirect(buildGoogleCalendarAuthorizationUrl(state));
    response.cookies.set("agendfined_google_calendar_oauth_state", `${business.id}.${state}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return response;
  } catch {
    return settingsRedirect(request, "not_configured");
  }
}

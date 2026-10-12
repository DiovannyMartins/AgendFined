import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { isProPlan } from "@/lib/plan/plan";
import { buildGoogleCalendarAuthorizationUrl } from "@/lib/google-calendar/oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const business = await getCurrentBusiness();
  const destination = new URL("/dashboard/configuracoes", request.url);
  if (!business) {
    destination.searchParams.set("calendar", "unauthorized");
    return NextResponse.redirect(destination);
  }
  if (!isProPlan(business.plan)) {
    destination.searchParams.set("calendar", "upgrade_required");
    return NextResponse.redirect(destination);
  }

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
    destination.searchParams.set("calendar", "not_configured");
    return NextResponse.redirect(destination);
  }
}

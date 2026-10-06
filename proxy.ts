import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { sendSecurityLog } from "@/lib/security/betterstack";

const PROTECTED_PREFIXES = ["/dashboard"];
// /redefinir-senha is deliberately NOT in AUTH_ROUTES: it must remain reachable
// by a user who has just settled a password-recovery session (§24), otherwise the
// proxy would bounce them to /dashboard before they can set a new password.
const AUTH_ROUTES = ["/login", "/cadastro", "/recuperar-senha"];

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname;
  let response: NextResponse;
  if (
    /^\/(?:\.git|\.env|\.next|node_modules)(?:\/|$)/i.test(pathname) ||
    pathname.endsWith(".map")
  ) {
    response = new NextResponse(null, { status: 404 });
  } else {
    const { supabaseResponse, user } = await updateSession(request);

    const isProtected = PROTECTED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

    if (isProtected && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      response = NextResponse.redirect(url);
    } else {
      const isAuthRoute = AUTH_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`),
      );

      if (isAuthRoute && user) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = "";
        response = NextResponse.redirect(url);
      } else {
        response = supabaseResponse;
      }
    }
  }

  // Log path and status only: query strings may contain booking codes or OAuth
  // tokens. The numeric status enables a Better Stack alert for HTTP 5xx.
  if (process.env.NODE_ENV === "production") {
    const entry = {
      event: "http.request",
      method: request.method,
      path: pathname,
      status: response.status,
      at: new Date().toISOString(),
    };
    console.info(JSON.stringify(entry));
    event.waitUntil(sendSecurityLog(entry));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

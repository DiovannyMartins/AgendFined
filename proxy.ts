import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PROTECTED_PREFIXES = ["/dashboard"];
// /redefinir-senha is deliberately NOT in AUTH_ROUTES: it must remain reachable
// by a user who has just settled a password-recovery session (§24), otherwise the
// proxy would bounce them to /dashboard before they can set a new password.
const AUTH_ROUTES = ["/login", "/cadastro", "/recuperar-senha"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    /^\/(?:\.git|\.env|\.next|node_modules)(?:\/|$)/i.test(pathname) ||
    pathname.endsWith(".map")
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const { supabaseResponse, user } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

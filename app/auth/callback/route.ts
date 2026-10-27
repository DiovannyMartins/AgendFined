import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type NextRequest } from "next/server";
import { trustedAppOrigin } from "@/lib/app-origin";

// Every auth e-mail links through {{ .ConfirmationURL }} and the server client
// uses PKCE, so the app's flows (signup, password reset) always arrive here
// with a `code`. Anything else is rejected.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only allow same-origin paths to avoid an open redirect (mirrors login).
  const requested = searchParams.get("next") ?? "/dashboard";
  const next = requested.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/\\")
    ? requested
    : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${trustedAppOrigin(origin)}${next}`);
    }
  }

  return NextResponse.redirect(`${trustedAppOrigin(origin)}/login?error=auth`);
}

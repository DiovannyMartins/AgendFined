import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type NextRequest } from "next/server";

function trustedOrigin(requestOrigin: string): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) return requestOrigin;
  try {
    return new URL(configured).origin;
  } catch {
    return requestOrigin;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Only allow same-origin paths to avoid an open redirect (mirrors login).
  const requested = searchParams.get("next") ?? "/dashboard";
  const next = requested.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/\\")
    ? requested
    : "/dashboard";

  const supabase = await createClient();
  let error: { message?: string } | null = { message: "missing_auth_credential" };
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as Parameters<typeof supabase.auth.verifyOtp>[0]["type"],
    }));
  }

  if (!error) {
    return NextResponse.redirect(`${trustedOrigin(origin)}${next}`);
  }

  return NextResponse.redirect(`${trustedOrigin(origin)}/login?error=auth`);
}

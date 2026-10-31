import { AuthError, type AuthMFAGetAuthenticatorAssuranceLevelResponse, type SupabaseClient } from "@supabase/supabase-js";

// Supabase leaves room for future assurance levels (`string & {}`), while the
// current policy only needs to distinguish aal2 from every lower level.
export type AssuranceLevel = string | null;

export function requiresMfaChallenge(assurance: {
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
}): boolean {
  return assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2";
}

type AssuranceClient = {
  auth: Pick<SupabaseClient["auth"], "getSession"> & {
    mfa: Pick<SupabaseClient["auth"]["mfa"], "getAuthenticatorAssuranceLevel">;
  };
  rpc: (fn: "current_session_mfa_verified") => PromiseLike<{ data: boolean | null; error: unknown }>;
};

// Without an argument, getAuthenticatorAssuranceLevel reads nextLevel from the
// user copied into the session cookie, which whoever holds the cookie can
// edit. Given the access token, Supabase Auth validates it and answers with
// the factors it stores, so a session cannot skip the second factor by
// dropping its factors from the cookie.
//
// An aal2 counts only when the session confirmed the code through verifyTotp
// (GHSA-vjcg): one verified straight against Supabase Auth skipped the attempt
// limit, so the app treats it as aal1 and sends it back to /mfa, just like
// private.mfa_aal_allowed() does for RLS.
export async function getVerifiedAssurance(
  supabase: AssuranceClient,
): Promise<AuthMFAGetAuthenticatorAssuranceLevelResponse> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) return { data: null, error };
  if (!session) {
    return { data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] }, error: null };
  }
  const result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
  if (result.error || result.data.currentLevel !== "aal2" || result.data.nextLevel !== "aal2") return result;

  const { data: verifiedByApp, error: verifiedError } = await supabase.rpc("current_session_mfa_verified");
  if (verifiedError) return { data: null, error: new AuthError("Could not check the MFA session.") };
  return verifiedByApp === true ? result : { data: { ...result.data, currentLevel: "aal1" }, error: null };
}

export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\") ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return fallback;
  }
  // URL parsers remove control characters and normalize separators. Check the
  // interpreted origin as well as the input before handing it to a redirect.
  const origin = "https://internal.invalid";
  try {
    return new URL(value, origin).origin === origin ? value : fallback;
  } catch {
    return fallback;
  }
}

export function mfaChallengePath(next: string): string {
  return `/mfa?${new URLSearchParams({ next: safeInternalPath(next) }).toString()}`;
}

// The proxy forwards the requested path to server components, so a session
// that still needs the second factor returns to /dashboard/agenda (not just
// /dashboard) after the code (#149). Set by the proxy on every request, so a
// value sent by the browser is always overwritten.
export const REQUEST_PATH_HEADER = "x-request-path";

export function requestPathOf(url: URL): string {
  const params = new URLSearchParams(url.search);
  // Client navigations fetch the RSC payload with ?_rsc=…; it is not part of
  // the page address.
  params.delete("_rsc");
  const search = params.toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
}

// Supabase leaves room for future assurance levels (`string & {}`), while the
// current policy only needs to distinguish aal2 from every lower level.
export type AssuranceLevel = string | null;

export function requiresMfaChallenge(assurance: {
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
}): boolean {
  return assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2";
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

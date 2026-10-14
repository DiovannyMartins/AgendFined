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

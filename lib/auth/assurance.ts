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
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : fallback;
}

export function mfaChallengePath(next: string): string {
  return `/mfa?${new URLSearchParams({ next: safeInternalPath(next) }).toString()}`;
}

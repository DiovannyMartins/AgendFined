// Public reservation code (§16). An 8-character, uppercase Crockford base32 code
// grouped as XXXX-XXXX for display. The alphabet is standard Crockford: it keeps
// 0 and 1 and drops the look-alikes O, I and L (and U). Input is decoded the
// Crockford way, so a customer who reads "06YT-WMW1" and types "O6YT-WMWI"
// still finds the reservation.
// The stored value has no hyphen; display and validation normalize on the fly.
// It must never authorize a mutation or access to personal data. Customer
// cancellation uses an independently generated private capability.

export const PUBLIC_CODE_LENGTH = 8;

// Crockford base32 alphabet: digits plus letters minus I, L, O and U. 32 symbols.
export const PUBLIC_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Matches exactly PUBLIC_CODE_LENGTH symbols from the alphabet.
export const PUBLIC_CODE_REGEX = /^[0-9A-HJKMNPQRSTVWXYZ]{8}$/;

// Strip separators (hyphens/spaces), uppercase and map the Crockford
// look-alikes O→0 and I/L→1, so "ab12-cd34" normalizes to "AB12CD34" and
// "o6yt-wmwi" to "06YTWMW1".
export function normalizePublicCode(input: string): string {
  return input
    .replace(/[-\s]/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

// True when the input (after normalization) is a well-formed public code.
export function isValidPublicCode(input: string): boolean {
  return PUBLIC_CODE_REGEX.test(normalizePublicCode(input));
}

// True when a stored code contains the (normalized) search query, so a
// partial or hand-typed code still finds the reservation in a search box.
export function matchesPublicCode(code: string, query: string): boolean {
  const normalized = normalizePublicCode(query);
  return normalized !== "" && normalizePublicCode(code).includes(normalized);
}

// Group the stored 8-char code for display: "AB12CD34" -> "AB12-CD34".
export function formatPublicCode(code: string): string {
  const normalized = normalizePublicCode(code);
  if (normalized.length !== PUBLIC_CODE_LENGTH) return code;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

// Public reservation code (§16). An 8-character, uppercase Crockford base32 code
// (no 0/O, 1/I/L — unambiguous to read aloud) grouped as XXXX-XXXX for display.
// The stored value has no hyphen; display and validation normalize on the fly.
// It must never authorize a mutation or access to personal data. Customer
// cancellation uses an independently generated private capability.

export const PUBLIC_CODE_LENGTH = 8;

// Crockford base32 alphabet minus the ambiguous 0/O, 1/I and L. 32 symbols.
export const PUBLIC_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Matches exactly PUBLIC_CODE_LENGTH symbols from the alphabet.
export const PUBLIC_CODE_REGEX = /^[0-9A-HJKMNPQRSTVWXYZ]{8}$/;

// Strip separators (hyphens/spaces) and uppercase, so a customer pasting
// "ab12-cd34" or typing "ab12cd34" both normalize to "AB12CD34".
export function normalizePublicCode(input: string): string {
  return input.replace(/[-\s]/g, "").toUpperCase();
}

// True when the input (after normalization) is a well-formed public code.
export function isValidPublicCode(input: string): boolean {
  return PUBLIC_CODE_REGEX.test(normalizePublicCode(input));
}

// Group the stored 8-char code for display: "AB12CD34" -> "AB12-CD34".
export function formatPublicCode(code: string): string {
  const normalized = normalizePublicCode(code);
  if (normalized.length !== PUBLIC_CODE_LENGTH) return code;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

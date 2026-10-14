const CANCEL_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

// Client-safe validation for the 256-bit base64url capability issued once when
// a reserva is created. Cryptographic generation and hashing remain server-only.
export function isValidCancelToken(token: string): boolean {
  return CANCEL_TOKEN_REGEX.test(token);
}

import { createHash, randomBytes } from "node:crypto";

const CANCEL_TOKEN_BYTES = 32;
const CANCEL_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

// The public booking code identifies a reservation but never authorizes a
// mutation. Cancellation uses an independent 256-bit capability. Only its
// SHA-256 digest is persisted; the raw token is issued once to the customer.
export function generateCancelToken(): string {
  return randomBytes(CANCEL_TOKEN_BYTES).toString("base64url");
}

export function isValidCancelToken(token: string): boolean {
  return CANCEL_TOKEN_REGEX.test(token);
}

export function hashCancelToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

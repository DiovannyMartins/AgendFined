import { createHash, randomBytes } from "node:crypto";
import { isValidCancelToken } from "./cancel-token";

const CANCEL_TOKEN_BYTES = 32;

export { isValidCancelToken } from "./cancel-token";

// The public booking code identifies a reservation but never authorizes a
// mutation. Cancellation uses an independent 256-bit capability. Only its
// SHA-256 digest is persisted; the raw token is issued once to the customer.
export function generateCancelToken(): string {
  return randomBytes(CANCEL_TOKEN_BYTES).toString("base64url");
}

export function hashCancelToken(token: string): string {
  if (!isValidCancelToken(token)) throw new Error("INVALID_CANCEL_TOKEN");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

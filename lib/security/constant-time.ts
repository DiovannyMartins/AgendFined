import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

// String equality without an early exit. Both sides are hashed first, so the
// comparison always runs over 32 bytes and does not reveal the length either.
export function constantTimeEqual(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

import "server-only";

import { timingSafeEqual } from "node:crypto";

// String equality without an early exit over the contents. Only the length is
// compared openly, so use it for values whose length is not secret (a random
// OAuth state, a fixed-size token).
export function constantTimeEqual(given: string, expected: string): boolean {
  const givenBytes = Buffer.from(given);
  const expectedBytes = Buffer.from(expected);
  return givenBytes.length === expectedBytes.length && timingSafeEqual(givenBytes, expectedBytes);
}

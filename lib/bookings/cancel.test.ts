import { describe, expect, it } from "vitest";
import { generateCancelToken, hashCancelToken, isValidCancelToken } from "@/lib/bookings/cancel";

describe("private booking cancellation capability", () => {
  it("generates independent 256-bit base64url tokens", () => {
    const first = generateCancelToken();
    const second = generateCancelToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(second).not.toBe(first);
  });

  it("stores a deterministic SHA-256 digest instead of the raw token", () => {
    const token = generateCancelToken();
    const digest = hashCancelToken(token);

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCancelToken(token)).toBe(digest);
    expect(digest).not.toContain(token);
  });

  it("rejects malformed capabilities before database verification", () => {
    expect(isValidCancelToken(generateCancelToken())).toBe(true);
    expect(isValidCancelToken("")).toBe(false);
    expect(isValidCancelToken("public-code-only")).toBe(false);
    expect(isValidCancelToken("a".repeat(44))).toBe(false);
  });
});

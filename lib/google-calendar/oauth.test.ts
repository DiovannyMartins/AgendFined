// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptGoogleToken, encryptGoogleToken } from "./oauth";

beforeEach(() => {
  vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Google token encryption", () => {
  it("decrypts what it encrypted", () => {
    expect(decryptGoogleToken(encryptGoogleToken("1//refresh"))).toBe("1//refresh");
  });

  // Sem o tamanho, o GCM aceita uma tag truncada, que é mais fácil de forjar.
  it.each([4, 8, 12, 15])("rejects a token whose authentication tag was cut to %i bytes", (length) => {
    const [iv, tag, ciphertext] = encryptGoogleToken("1//refresh").split(".");
    const shortTag = Buffer.from(tag, "base64url").subarray(0, length).toString("base64url");

    expect(() => decryptGoogleToken([iv, shortTag, ciphertext].join("."))).toThrow();
  });

  it("rejects a token whose authentication tag was altered", () => {
    const [iv, tag, ciphertext] = encryptGoogleToken("1//refresh").split(".");
    const altered = Buffer.from(tag, "base64url");
    altered[0] ^= 1;

    expect(() => decryptGoogleToken([iv, altered.toString("base64url"), ciphertext].join("."))).toThrow();
  });
});

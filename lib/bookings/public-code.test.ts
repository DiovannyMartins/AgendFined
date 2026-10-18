import { describe, expect, it } from "vitest";
import {
  PUBLIC_CODE_ALPHABET,
  PUBLIC_CODE_LENGTH,
  formatPublicCode,
  isValidPublicCode,
  matchesPublicCode,
  normalizePublicCode,
} from "@/lib/bookings/public-code";

describe("normalizePublicCode", () => {
  it("strips hyphens and whitespace", () => {
    expect(normalizePublicCode(" ab12-cd34 ")).toBe("AB12CD34");
  });

  it("uppercases", () => {
    expect(normalizePublicCode("ab12cd34")).toBe("AB12CD34");
  });

  it("is idempotent", () => {
    expect(normalizePublicCode(normalizePublicCode("ab12-cd34"))).toBe("AB12CD34");
    expect(normalizePublicCode(normalizePublicCode("o6yt-wmwi"))).toBe("06YTWMW1");
  });

  // Crockford decoding: O reads as 0, I and L read as 1 (#84).
  it("maps the Crockford look-alikes O→0 and I/L→1", () => {
    expect(normalizePublicCode("o6yt-wmwi")).toBe("06YTWMW1");
    expect(normalizePublicCode("O6YTWMWL")).toBe("06YTWMW1");
    expect(normalizePublicCode("06yt wmw1")).toBe("06YTWMW1");
    expect(normalizePublicCode("oil0-OIL1")).toBe("01100111");
  });
});

describe("formatPublicCode", () => {
  it("groups an 8-char code as XXXX-XXXX", () => {
    expect(formatPublicCode("AB12CD34")).toBe("AB12-CD34");
  });

  it("normalizes before grouping", () => {
    expect(formatPublicCode("ab12-cd34")).toBe("AB12-CD34");
  });

  it("returns the input as-is when not 8 chars", () => {
    expect(formatPublicCode("AB12")).toBe("AB12");
    expect(formatPublicCode("")).toBe("");
  });
});

describe("isValidPublicCode", () => {
  it("accepts a valid code with or without separators", () => {
    expect(isValidPublicCode("AB12CD34")).toBe(true);
    expect(isValidPublicCode("ab12-cd34")).toBe(true);
  });

  it("accepts O, I and L typed in place of 0 and 1", () => {
    expect(isValidPublicCode("O6YT-WMWI")).toBe(true);
    expect(isValidPublicCode("O6YTWMWL")).toBe(true);
  });

  it("rejects characters outside the Crockford alphabet", () => {
    // U has no Crockford decoding; punctuation is not a separator.
    expect(isValidPublicCode("AB12CD3U")).toBe(false);
    expect(isValidPublicCode("AB12CD3*")).toBe(false);
  });

  it("rejects wrong lengths", () => {
    expect(isValidPublicCode("AB12CD")).toBe(false);
    expect(isValidPublicCode("AB12CD34XX")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isValidPublicCode("")).toBe(false);
  });
});

describe("matchesPublicCode", () => {
  it("matches a partial or full query however it was typed", () => {
    expect(matchesPublicCode("06YTWMW1", "06yt")).toBe(true);
    expect(matchesPublicCode("06YTWMW1", "O6YT-WMWI")).toBe(true);
    expect(matchesPublicCode("06YTWMW1", "yt wm")).toBe(true);
  });

  it("does not match a different code", () => {
    expect(matchesPublicCode("06YTWMW1", "06YX")).toBe(false);
  });

  it("does not match a query that is only separators", () => {
    expect(matchesPublicCode("06YTWMW1", " - ")).toBe(false);
    expect(matchesPublicCode("06YTWMW1", "")).toBe(false);
  });
});

describe("constants", () => {
  it("alphabet has 32 unambiguous symbols", () => {
    expect(PUBLIC_CODE_ALPHABET).toHaveLength(32);
    expect(PUBLIC_CODE_LENGTH).toBe(8);
    expect(new Set(PUBLIC_CODE_ALPHABET).size).toBe(32);
  });
});

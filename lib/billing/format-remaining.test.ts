import { describe, expect, it } from "vitest";
import { formatGraceRemaining } from "./format-remaining";

describe("formatGraceRemaining", () => {
  it("returns expirada for zero or negative", () => {
    expect(formatGraceRemaining(0)).toBe("expirada");
    expect(formatGraceRemaining(-1000)).toBe("expirada");
  });

  it("formats seconds only under a minute", () => {
    expect(formatGraceRemaining(30_000)).toBe("30s");
  });

  it("formats minutes and seconds", () => {
    expect(formatGraceRemaining((12 * 60 + 30) * 1000)).toBe("12m 30s");
  });

  it("formats hours, minutes and seconds", () => {
    expect(formatGraceRemaining((4 * 3600 + 12 * 60 + 30) * 1000)).toBe("4h 12m 30s");
  });

  it("formats days, hours, minutes and seconds", () => {
    expect(formatGraceRemaining((2 * 86_400 + 4 * 3600 + 12 * 60 + 30) * 1000)).toBe("2d 4h 12m 30s");
  });
});

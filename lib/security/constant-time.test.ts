// @vitest-environment node
import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "./constant-time";

describe("constantTimeEqual", () => {
  it("accepts only the exact string", () => {
    expect(constantTimeEqual("expected-state", "expected-state")).toBe(true);
    expect(constantTimeEqual("expected-statE", "expected-state")).toBe(false);
    expect(constantTimeEqual("expected-state ", "expected-state")).toBe(false);
    expect(constantTimeEqual("", "expected-state")).toBe(false);
  });
});

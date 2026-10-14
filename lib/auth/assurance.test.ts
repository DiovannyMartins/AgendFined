import { describe, expect, it } from "vitest";
import { mfaChallengePath, requiresMfaChallenge, safeInternalPath } from "./assurance";

describe("authentication assurance policy", () => {
  it("requires a challenge when the account supports AAL2 but the session is AAL1", () => {
    expect(requiresMfaChallenge({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
  });

  it("allows a password change at the highest assurance available to the account", () => {
    expect(requiresMfaChallenge({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
    expect(requiresMfaChallenge({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
  });

  it("preserves only same-origin return paths through the MFA challenge", () => {
    expect(mfaChallengePath("/redefinir-senha")).toBe("/mfa?next=%2Fredefinir-senha");
    expect(safeInternalPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/\\evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/dashboard\\evil", "/dashboard")).toBe("/dashboard");
  });
});

import { describe, expect, it, vi } from "vitest";
import { getVerifiedAssurance, mfaChallengePath, requestPathOf, requiresMfaChallenge, safeInternalPath } from "./assurance";

describe("authentication assurance policy", () => {
  it.each(["/\t/example.org", "/\n/example.org", "/\r/example.org", "/dashboard\u0000"])("rejects control characters in return path %j", (path) => {
    expect(safeInternalPath(path)).toBe("/dashboard");
  });

  it("preserves a local destination with query and fragment", () => {
    expect(safeInternalPath("/dashboard?tab=agenda#today")).toBe("/dashboard?tab=agenda#today");
  });
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

describe("requestPathOf (#149)", () => {
  it("keeps the path and the query of the requested page", () => {
    expect(requestPathOf(new URL("https://agendfined.com.br/dashboard/agenda?data=2026-10-22"))).toBe(
      "/dashboard/agenda?data=2026-10-22",
    );
  });

  it("drops the RSC fetch parameter of client navigations", () => {
    expect(requestPathOf(new URL("https://agendfined.com.br/dashboard/agenda?_rsc=abc"))).toBe("/dashboard/agenda");
  });

  it("sends the second-factor challenge back to the requested page", () => {
    expect(mfaChallengePath(requestPathOf(new URL("https://agendfined.com.br/dashboard/agenda")))).toBe(
      "/mfa?next=%2Fdashboard%2Fagenda",
    );
  });
});

describe("getVerifiedAssurance", () => {
  function client(session: { access_token: string } | null) {
    return {
      auth: {
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({
            data: { currentLevel: "aal1" as const, nextLevel: "aal2" as const, currentAuthenticationMethods: [] },
            error: null,
          })),
        },
      },
    };
  }

  // Sem o token, o Supabase lê os fatores da cópia do usuário no cookie, que
  // quem tem o cookie pode editar.
  it("asks Supabase Auth with the session access token, not the cookie's user", async () => {
    const supabase = client({ access_token: "access-token" });

    const result = await getVerifiedAssurance(supabase as never);

    expect(supabase.auth.mfa.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("access-token");
    expect(requiresMfaChallenge(result.data!)).toBe(true);
  });

  it("answers without levels when there is no session", async () => {
    const supabase = client(null);

    await expect(getVerifiedAssurance(supabase as never)).resolves.toEqual({
      data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
      error: null,
    });
    expect(supabase.auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
});

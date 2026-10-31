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
  function client(
    session: { access_token: string } | null,
    currentLevel: "aal1" | "aal2" = "aal1",
    verifiedByApp: { data: boolean | null; error: unknown } = { data: true, error: null },
  ) {
    return {
      auth: {
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({
            data: { currentLevel, nextLevel: "aal2" as const, currentAuthenticationMethods: [] },
            error: null,
          })),
        },
      },
      rpc: vi.fn(async () => verifiedByApp),
    };
  }

  // GHSA-vjcg: um aal2 obtido direto no Supabase Auth pulou o limite de
  // tentativas do app; a sessão volta para /mfa.
  it("keeps an aal2 the session confirmed through the app", async () => {
    const supabase = client({ access_token: "access-token" }, "aal2");

    const result = await getVerifiedAssurance(supabase as never);

    expect(supabase.rpc).toHaveBeenCalledWith("current_session_mfa_verified");
    expect(result.data?.currentLevel).toBe("aal2");
    expect(requiresMfaChallenge(result.data!)).toBe(false);
  });

  it("treats an aal2 confirmed straight against Supabase Auth as aal1", async () => {
    const supabase = client({ access_token: "access-token" }, "aal2", { data: false, error: null });

    const result = await getVerifiedAssurance(supabase as never);

    expect(result.data?.currentLevel).toBe("aal1");
    expect(requiresMfaChallenge(result.data!)).toBe(true);
  });

  it("fails closed when the database cannot tell how the aal2 was confirmed", async () => {
    const supabase = client({ access_token: "access-token" }, "aal2", { data: null, error: { message: "down" } });

    const result = await getVerifiedAssurance(supabase as never);

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("does not ask the database while the session is still aal1", async () => {
    const supabase = client({ access_token: "access-token" });

    await getVerifiedAssurance(supabase as never);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

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

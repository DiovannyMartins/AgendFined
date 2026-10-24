import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase Auth and the service-role RPCs are the external boundary of the
// códigos de recuperação (#169, ADR 0009).
const USER = { id: "7f3c1a52-8f4e-4c55-9d1e-0a6b2f1c9e10", email: "dono@agendfined.dev" };

const auth = {
  getUser: vi.fn(),
  refreshSession: vi.fn(),
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
    unenroll: vi.fn(),
  },
};
const admin = {
  rpc: vi.fn(),
  auth: { admin: { mfa: { listFactors: vi.fn(), deleteFactor: vi.fn() } } },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
const { enforceMfaRateLimit } = vi.hoisted(() => ({ enforceMfaRateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceAuthRateLimit: async () => true,
  enforceMfaRateLimit,
  getClientIp: async () => "203.0.113.7",
}));
const { auditSecurityEvent } = vi.hoisted(() => ({ auditSecurityEvent: vi.fn() }));
vi.mock("@/lib/security/audit", () => ({ auditSecurityEvent }));
const { sendMfaRecoveryUsedEmail } = vi.hoisted(() => ({ sendMfaRecoveryUsedEmail: vi.fn() }));
vi.mock("@/lib/email/mfa-recovery-used", () => ({ sendMfaRecoveryUsedEmail }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { generateMfaRecoveryCodes, redeemMfaRecoveryCode, removeTotp } = await import("./actions");
const { hashRecoveryCode } = await import("./recovery-codes");

function assurance(currentLevel: string, nextLevel: string) {
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel, nextLevel }, error: null });
}

function rpcCalls(name: string) {
  return admin.rpc.mock.calls.filter(([fn]) => fn === name);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://agenda.example");
  auth.getUser.mockResolvedValue({ data: { user: USER } });
  auth.mfa.listFactors.mockResolvedValue({
    data: { totp: [{ id: "factor-1", status: "verified" }] },
    error: null,
  });
  auth.mfa.unenroll.mockResolvedValue({ error: null });
  auth.refreshSession.mockResolvedValue({ data: {}, error: null });
  admin.rpc.mockResolvedValue({ data: null, error: null });
  admin.auth.admin.mfa.listFactors.mockResolvedValue({
    data: { factors: [{ id: "factor-1", status: "verified" }, { id: "factor-2", status: "unverified" }] },
    error: null,
  });
  admin.auth.admin.mfa.deleteFactor.mockResolvedValue({ data: {}, error: null });
  sendMfaRecoveryUsedEmail.mockResolvedValue({ sent: true });
  enforceMfaRateLimit.mockResolvedValue(true);
});

describe("generateMfaRecoveryCodes (#169)", () => {
  it("troca os códigos do dono e devolve os novos uma única vez", async () => {
    assurance("aal2", "aal2");

    const result = await generateMfaRecoveryCodes();

    expect(result.ok).toBe(true);
    const codes = result.ok ? result.data.codes : [];
    expect(codes).toHaveLength(10);
    const [[, args]] = rpcCalls("replace_mfa_recovery_codes");
    expect(args.p_user_id).toBe(USER.id);
    expect(args.p_code_hashes).toEqual(codes.map((code) => hashRecoveryCode(USER.id, code.replace("-", ""))));
    expect(auditSecurityEvent).toHaveBeenCalledWith("auth.mfa_recovery_codes_generated", USER.id);
  });

  it("exige a sessão confirmada pelo autenticador", async () => {
    assurance("aal1", "aal2");

    await expect(generateMfaRecoveryCodes()).resolves.toMatchObject({ ok: false, code: "MFA_REQUIRED" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("não gera códigos sem um autenticador ativo", async () => {
    assurance("aal2", "aal1");
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    await expect(generateMfaRecoveryCodes()).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe("redeemMfaRecoveryCode (#169)", () => {
  it("desativa o autenticador, apaga os demais códigos e avisa o dono por e-mail", async () => {
    assurance("aal1", "aal2");
    admin.rpc.mockImplementation(async (fn: string) => ({ data: fn === "consume_mfa_recovery_code" ? true : null, error: null }));

    await expect(redeemMfaRecoveryCode("ab12c-de34f")).resolves.toEqual({ ok: true, data: undefined });

    expect(rpcCalls("consume_mfa_recovery_code")).toEqual([
      ["consume_mfa_recovery_code", { p_user_id: USER.id, p_code_hash: hashRecoveryCode(USER.id, "AB12CDE34F") }],
    ]);
    expect(admin.auth.admin.mfa.listFactors).toHaveBeenCalledWith({ userId: USER.id });
    expect(admin.auth.admin.mfa.deleteFactor).toHaveBeenCalledWith({ id: "factor-1", userId: USER.id });
    expect(admin.auth.admin.mfa.deleteFactor).toHaveBeenCalledWith({ id: "factor-2", userId: USER.id });
    // The session cookie still lists the removed factor until it is refreshed.
    expect(auth.refreshSession).toHaveBeenCalled();
    expect(rpcCalls("clear_mfa_recovery_codes")).toEqual([["clear_mfa_recovery_codes", { p_user_id: USER.id }]]);
    expect(sendMfaRecoveryUsedEmail).toHaveBeenCalledWith({
      ownerEmail: USER.email,
      mfaUrl: "https://agenda.example/mfa",
    });
    expect(auditSecurityEvent).toHaveBeenCalledWith("auth.mfa_recovery_code_used", USER.id);
  });

  it("não mexe no autenticador com um código errado ou já usado", async () => {
    assurance("aal1", "aal2");
    admin.rpc.mockResolvedValue({ data: false, error: null });

    await expect(redeemMfaRecoveryCode("AB12C-DE34F")).resolves.toMatchObject({ ok: false, code: "INVALID_CODE" });

    expect(admin.auth.admin.mfa.deleteFactor).not.toHaveBeenCalled();
    expect(sendMfaRecoveryUsedEmail).not.toHaveBeenCalled();
    expect(auditSecurityEvent).toHaveBeenCalledWith("auth.mfa_recovery_code_failed", USER.id);
  });

  it("recusa um código fora do formato sem gastar tentativa", async () => {
    await expect(redeemMfaRecoveryCode("123456")).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(enforceMfaRateLimit).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("divide o limite de tentativas com o código do autenticador", async () => {
    assurance("aal1", "aal2");
    enforceMfaRateLimit.mockResolvedValue(false);

    await expect(redeemMfaRecoveryCode("AB12C-DE34F")).resolves.toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(enforceMfaRateLimit).toHaveBeenCalledWith(admin, USER.id);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["já confirmada pelo autenticador", "aal2", "aal2"],
    ["sem autenticador", "aal1", "aal1"],
  ])("não serve para uma sessão %s", async (_label, currentLevel, nextLevel) => {
    assurance(currentLevel, nextLevel);

    await expect(redeemMfaRecoveryCode("AB12C-DE34F")).resolves.toMatchObject({ ok: false, code: "MFA_NOT_REQUIRED" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("pede outro código quando o Auth não remove o autenticador", async () => {
    assurance("aal1", "aal2");
    admin.rpc.mockImplementation(async (fn: string) => ({ data: fn === "consume_mfa_recovery_code" ? true : null, error: null }));
    admin.auth.admin.mfa.deleteFactor.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(redeemMfaRecoveryCode("AB12C-DE34F")).resolves.toMatchObject({
      ok: false,
      code: "UNEXPECTED_ERROR",
      message: expect.stringContaining("outro código"),
    });
    expect(rpcCalls("clear_mfa_recovery_codes")).toEqual([]);
    expect(sendMfaRecoveryUsedEmail).not.toHaveBeenCalled();
  });
});

describe("removeTotp (#169)", () => {
  it("apaga os códigos de recuperação junto com o autenticador", async () => {
    assurance("aal2", "aal2");

    await expect(removeTotp("factor-1")).resolves.toEqual({ ok: true, data: undefined });

    expect(rpcCalls("clear_mfa_recovery_codes")).toEqual([["clear_mfa_recovery_codes", { p_user_id: USER.id }]]);
  });
});

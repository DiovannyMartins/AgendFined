import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMfaRecoveryUsedEmail } from "@/lib/email/mfa-recovery-used";

const input = {
  ownerEmail: "dono@example.com",
  mfaUrl: "https://agenda.example/mfa",
};

function stubResend() {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return () => JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendMfaRecoveryUsedEmail (#169)", () => {
  it("avisa o dono que um código de recuperação desativou o autenticador", async () => {
    const request = stubResend();

    await expect(sendMfaRecoveryUsedEmail(input)).resolves.toEqual({ sent: true });

    const body = request();
    expect(body.to).toEqual(["dono@example.com"]);
    expect(body.subject).toBe("Um código de recuperação foi usado na sua conta");
    expect(body.text).toContain("a autenticação em duas etapas foi desativada");
    expect(body.text).toContain("https://agenda.example/mfa");
    expect(body.text).toContain("Esqueceu a senha?");
    expect(body.html).toContain("https://agenda.example/mfa");
  });

  it("não envia sem o Resend configurado", async () => {
    await expect(sendMfaRecoveryUsedEmail(input)).resolves.toEqual({ sent: false, reason: "not_configured" });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPaymentFailedEmail } from "@/lib/email/payment-failed";

const input = {
  ownerEmail: "dono@example.com",
  businessName: "Barbearia <Demo>",
  activeUntil: "27/10/2026",
  planUrl: "https://agenda.example/dashboard/configuracoes#plano",
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

describe("sendPaymentFailedEmail", () => {
  it("asks the dono to update the payment method before the carência ends", async () => {
    const request = stubResend();

    await expect(sendPaymentFailedEmail(input)).resolves.toEqual({ sent: true });

    const body = request();
    expect(body.to).toEqual(["dono@example.com"]);
    expect(body.subject).toBe("Não conseguimos cobrar a sua assinatura");
    expect(body.text).toContain("O Mercado Pago recusou a cobrança do Plano AgendFined de");
    expect(body.text).toContain("Atualize a forma de pagamento até 27/10/2026 para manter o acesso. Depois dessa data, o negócio fica suspenso, sem perder dados.");
    expect(body.text).not.toMatch(/PROFISSIONAL|Grátis/);
    expect(body.text).toContain("https://agenda.example/dashboard/configuracoes#plano");
    expect(body.html).toContain("Barbearia &lt;Demo&gt;");
    expect(body.html).not.toContain("<Demo>");
  });

  it("does not send without Resend configured", async () => {
    await expect(sendPaymentFailedEmail(input)).resolves.toEqual({ sent: false, reason: "not_configured" });
  });
});

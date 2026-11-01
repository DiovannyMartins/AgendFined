import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPlanCutoverEmail } from "@/lib/email/plan-cutover";

const base = {
  ownerEmail: "dono@example.com",
  businessName: "Barbearia <Demo>",
  // Virada em 01/11/2026 às 21:00 em Brasília; o teste vai até 01/12/2026.
  trialEndsAt: "2026-12-02T00:00:00Z",
  timezone: "America/Sao_Paulo",
  price: "R$ 19,90",
  planUrl: "https://agenda.example/dashboard/configuracoes#plano",
  termsUrl: "https://agenda.example/termos",
  privacyUrl: "https://agenda.example/privacidade",
  idempotencyKey: "plan-cutover-send-1",
};
const VIRADA_DAY = new Date("2026-11-02T00:30:00Z");

function stubResend() {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return {
    body: () => JSON.parse(fetchMock.mock.calls[0][1].body as string),
    idempotencyKey: () => new Headers(fetchMock.mock.calls[0][1].headers).get("Idempotency-Key"),
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendPlanCutoverEmail", () => {
  it("diz que o Grátis acabou, quando o teste termina, o preço, que assinar no teste não perde dias e leva a assinar", async () => {
    const request = stubResend();

    await expect(sendPlanCutoverEmail(base, VIRADA_DAY)).resolves.toEqual({ sent: true });

    const body = request.body();
    expect(body.to).toEqual(["dono@example.com"]);
    expect(body.subject).toBe("O plano Grátis acabou: seu teste grátis de 30 dias começou");
    expect(body.text).toContain("o plano Grátis deixou de existir.");
    expect(body.text).toContain(
      "A partir de hoje, Barbearia <Demo> tem 30 dias de teste grátis com tudo incluído, sem cartão, até 01/12/2026 às 21:00 (horário de Brasília, UTC−3).",
    );
    expect(body.text).toContain("Depois do teste, o Plano AgendFined custa R$ 19,90/mês.");
    expect(body.text).toContain("não perde os dias que faltam: a primeira cobrança acontece na data do fim do teste.");
    expect(body.text).toContain("30 dias grátis, sem cartão · depois R$ 19,90/mês · cancele quando quiser");
    expect(body.text).toContain("Assinar o Plano AgendFined: https://agenda.example/dashboard/configuracoes#plano");
    expect(body.text).toContain("valem a partir de 1º/11/2026.");
    expect(body.text).toContain("Termos de Uso: https://agenda.example/termos");
    expect(body.text).toContain("Política de Privacidade: https://agenda.example/privacidade");
    expect(request.idempotencyKey()).toBe("plan-cutover-send-1");
  });

  it("usa o visual dos e-mails ao dono, escapa o nome do negócio e linka assinar, Termos e Privacidade", async () => {
    const request = stubResend();

    await sendPlanCutoverEmail(base, VIRADA_DAY);

    const html = request.body().html as string;
    expect(html).toContain("background-color:#141414");
    expect(html).toContain("https://agendfined.com.br/brand/email-logo.png");
    expect(html).toContain("<strong style=\"color:#eeeeee;\">Barbearia &lt;Demo&gt;</strong>");
    expect(html).not.toContain("<Demo>");
    expect(html).toContain('href="https://agenda.example/dashboard/configuracoes#plano"');
    expect(html).toContain('href="https://agenda.example/termos"');
    expect(html).toContain('href="https://agenda.example/privacidade"');
  });

  it("num envio atrasado diz desde quando vale o teste, em vez de hoje", async () => {
    const request = stubResend();

    await sendPlanCutoverEmail(base, new Date("2026-11-03T15:00:00Z"));

    expect(request.body().text).toContain("Desde 01/11/2026, Barbearia <Demo> tem 30 dias de teste grátis");
  });

  it("não envia sem o Resend configurado", async () => {
    await expect(sendPlanCutoverEmail(base, VIRADA_DAY)).resolves.toEqual({ sent: false, reason: "not_configured" });
  });
});

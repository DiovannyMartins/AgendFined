import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendTrialReminderEmail } from "@/lib/email/trial-reminder";

const base = {
  ownerEmail: "dono@example.com",
  businessName: "Barbearia <Demo>",
  // 10/03/2027 às 12:00 em Brasília.
  trialEndsAt: "2027-03-10T15:00:00Z",
  timezone: "America/Sao_Paulo",
  price: "R$ 19,90",
  planUrl: "https://agenda.example/dashboard/configuracoes#plano",
  idempotencyKey: "send-1",
};

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

describe("sendTrialReminderEmail", () => {
  it("em D-3 diz quantos dias faltam, quando o teste acaba no fuso do negócio e leva a assinar", async () => {
    const request = stubResend();

    await expect(sendTrialReminderEmail({ ...base, kind: "trial_ends_in_3_days", daysLeft: 3 })).resolves.toEqual({ sent: true });

    const body = request.body();
    expect(body.to).toEqual(["dono@example.com"]);
    expect(body.subject).toBe("Faltam 3 dias do seu teste grátis");
    expect(body.text).toContain("O teste grátis de Barbearia <Demo> termina em 10/03/2027 às 12:00 (horário de Brasília, UTC−3).");
    expect(body.text).toContain("Assine o Plano AgendFined (R$ 19,90/mês) para não perder o acesso.");
    expect(body.text).toContain("Assinar o Plano AgendFined: https://agenda.example/dashboard/configuracoes#plano");
    expect(body.html).toContain("TESTE GRÁTIS");
    expect(body.html).toContain("Barbearia &lt;Demo&gt;");
    expect(body.html).toContain('href="https://agenda.example/dashboard/configuracoes#plano"');
    expect(body.html).toContain("background-color:#141414");
    expect(body.html).toContain("https://agendfined.com.br/brand/email-logo.png");
    expect(request.idempotencyKey()).toBe("send-1");
  });

  it("usa o número de dias que falta de fato e o singular em D-1", async () => {
    const twoDays = stubResend();
    await sendTrialReminderEmail({ ...base, kind: "trial_ends_in_3_days", daysLeft: 2 });
    expect(twoDays.body().subject).toBe("Faltam 2 dias do seu teste grátis");

    vi.unstubAllGlobals();
    const oneDay = stubResend();
    await sendTrialReminderEmail({ ...base, kind: "trial_ends_in_1_day", daysLeft: 1 });
    expect(oneDay.body().subject).toBe("Falta 1 dia do seu teste grátis");
  });

  it("no dia do fim, antes da hora, diz que o teste termina hoje", async () => {
    const request = stubResend();

    await sendTrialReminderEmail({ ...base, kind: "trial_ends_in_1_day", daysLeft: 0 });

    expect(request.body().subject).toBe("Seu teste grátis termina hoje");
    expect(request.body().text).toContain("termina em 10/03/2027 às 12:00");
  });

  it("em D0 avisa que o negócio está suspenso, que nada foi apagado e leva a reativar", async () => {
    const request = stubResend();

    await sendTrialReminderEmail({ ...base, kind: "trial_ended", daysLeft: 0 });

    const body = request.body();
    expect(body.subject).toBe("Seu teste grátis acabou");
    expect(body.text).toContain("O teste grátis de Barbearia <Demo> acabou em 10/03/2027 às 12:00 (horário de Brasília, UTC−3) e o negócio está suspenso.");
    expect(body.text).toContain("Nada foi apagado");
    expect(body.text).toContain("Assine o Plano AgendFined (R$ 19,90/mês) para reativar");
    expect(body.text).toContain("Assinar o Plano AgendFined: https://agenda.example/dashboard/configuracoes#plano");
    expect(body.text).not.toMatch(/PROFISSIONAL|Grátis\b/);
  });
});

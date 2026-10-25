import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBusinessRescheduledEmail, sendCustomerRescheduledEmail } from "@/lib/email/booking-reschedule";

const input = {
  customerName: "Ana & João <cliente>",
  customerEmail: "ana@example.com",
  businessName: "Barbearia \"Demo\"",
  serviceName: "Corte <premium>",
  previousStartAt: "2026-05-10T18:00:00Z",
  startAt: "2026-05-12T13:30:00Z",
  timezone: "America/Sao_Paulo",
  publicCode: "65925DBB",
  bookingUrl: "https://agenda.example/barbearia/confirmacao?code=65925DBB&x=1",
};

function stubResend() {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendBusinessRescheduledEmail (#194)", () => {
  it("tells the cliente the new horário, the freed one and the code", async () => {
    const fetchMock = stubResend();

    await expect(sendBusinessRescheduledEmail(input)).resolves.toEqual({ sent: true });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({ to: ["ana@example.com"], subject: "Sua reserva foi remarcada" });
    expect(request.text).toContain("Barbearia \"Demo\" remarcou a sua reserva");
    expect(request.text).toContain("Novo horário: 12/05/2026 às 10:30 (horário de Brasília, UTC−3)");
    expect(request.text).toContain("Horário anterior: 10/05/2026 às 15:00");
    expect(request.text).toContain("6592-5DBB");
    expect(request.text).toContain(input.bookingUrl);
    expect(request.text).toContain("O link do e-mail de confirmação continua valendo");
    expect(request.html).toContain("REMARCAÇÃO DE RESERVA");
    expect(request.html).toContain("Ana &amp; João &lt;cliente&gt;");
    expect(request.html).toContain("Corte &lt;premium&gt;");
    expect(request.html).toContain("code=65925DBB&amp;x=1");
    expect(request.html).not.toContain("<cliente>");
  });

  it("never carries a cancel capability", async () => {
    const fetchMock = stubResend();

    await sendBusinessRescheduledEmail(input);

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain("#cancel=");
    expect(body).not.toContain("cancel=");
  });
});

describe("sendCustomerRescheduledEmail (#194)", () => {
  it("confirms the cliente's own remarcação", async () => {
    const fetchMock = stubResend();

    await sendCustomerRescheduledEmail(input);

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.subject).toBe("Você remarcou sua reserva");
    expect(request.text).toContain("O horário anterior foi liberado.");
  });
});

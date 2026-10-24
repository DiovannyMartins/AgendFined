import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendOwnerCustomerCancelledEmail,
  sendOwnerNewBookingEmail,
} from "@/lib/email/owner-booking-notification";

const input = {
  ownerEmail: "dono@example.com",
  businessName: "Barbearia \"Demo\"",
  customerName: "Ana & João <cliente>",
  customerPhone: "11987654321",
  serviceName: "Corte <premium>",
  startAt: "2026-05-10T18:00:00Z",
  timezone: "America/Sao_Paulo",
  publicCode: "65925DBB",
  agendaUrl: "https://agenda.example/dashboard/agenda",
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

describe("sendOwnerNewBookingEmail", () => {
  it("tells the dono who reserved what and when, addressed to the account e-mail", async () => {
    const request = stubResend();

    await expect(sendOwnerNewBookingEmail(input)).resolves.toEqual({ sent: true });

    const body = request();
    expect(body).toMatchObject({
      from: "AgendFined <reservas@example.com>",
      to: ["dono@example.com"],
      subject: "Nova reserva: Ana & João <cliente>, 10/05/2026 às 15:00",
    });
    expect(body.text).toContain("Ana & João <cliente> fez uma reserva em Barbearia \"Demo\".");
    expect(body.text).toContain("Corte <premium>");
    expect(body.text).toContain("10/05/2026 às 15:00 (horário de Brasília, UTC−3)");
    expect(body.text).toContain("(11) 98765-4321");
    expect(body.text).toContain("6592-5DBB");
    expect(body.text).toContain(input.agendaUrl);
    expect(body.html).toContain("NOVA RESERVA");
    expect(body.html).toContain("Ana &amp; João &lt;cliente&gt;");
    expect(body.html).toContain("Barbearia &quot;Demo&quot;");
    expect(body.html).toContain("Corte &lt;premium&gt;");
    expect(body.html).toContain("(11) 98765-4321");
    expect(body.html).toContain("https://agenda.example/dashboard/agenda");
    expect(body.html).not.toContain("<cliente>");
  });

  // #179: a observação (alergia, acessibilidade, preferência) é o que o dono
  // precisa ler antes do atendimento.
  it("includes the cliente's observação, escaped, when there is one", async () => {
    const request = stubResend();

    await sendOwnerNewBookingEmail({ ...input, customerNote: "Alergia a <amônia> & tintas\nchego cedo" });

    const body = request();
    expect(body.text).toContain("Observação: Alergia a <amônia> & tintas\nchego cedo");
    expect(body.html).toContain("OBSERVAÇÃO");
    expect(body.html).toContain("Alergia a &lt;amônia&gt; &amp; tintas<br>chego cedo");
    expect(body.html).not.toContain("<amônia>");
    expect(body.text).not.toContain("Leia a observação antes do atendimento.");
  });

  it("highlights an observação that needs attention before the atendimento", async () => {
    const request = stubResend();

    await sendOwnerNewBookingEmail({ ...input, customerNote: "Uso cadeira de rodas", customerNoteRequiresFollowUp: true });

    const body = request();
    expect(body.text).toContain("Leia a observação antes do atendimento.");
    expect(body.html).toContain("Leia a observação antes do atendimento.");
  });

  it("leaves the observação out when the cliente wrote none", async () => {
    const request = stubResend();

    await sendOwnerNewBookingEmail({ ...input, customerNote: "   ", customerNoteRequiresFollowUp: true });

    const body = request();
    expect(body.text).not.toContain("Observação");
    expect(body.html).not.toContain("OBSERVAÇÃO");
    expect(body.html).not.toContain("Leia a observação");
  });

  it("reports a missing provider configuration instead of throwing", async () => {
    await expect(sendOwnerNewBookingEmail(input)).resolves.toEqual({ sent: false, reason: "not_configured" });
  });
});

describe("sendOwnerCustomerCancelledEmail", () => {
  it("tells the dono the cliente cancelled and the horário is free again", async () => {
    const request = stubResend();

    await expect(sendOwnerCustomerCancelledEmail(input)).resolves.toEqual({ sent: true });

    const body = request();
    expect(body).toMatchObject({
      to: ["dono@example.com"],
      subject: "Reserva cancelada: Ana & João <cliente>, 10/05/2026 às 15:00",
    });
    expect(body.text).toContain("Ana & João <cliente> cancelou a reserva em Barbearia \"Demo\". O horário foi liberado.");
    expect(body.text).toContain("10/05/2026 às 15:00 (horário de Brasília, UTC−3)");
    expect(body.html).toContain("RESERVA CANCELADA PELO CLIENTE");
    expect(body.html).toContain("text-decoration:line-through");
    expect(body.html).not.toContain("<cliente>");
  });
});

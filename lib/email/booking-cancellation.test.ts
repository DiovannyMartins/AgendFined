import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBusinessCancelledEmail, sendCustomerCancelledEmail } from "@/lib/email/booking-cancellation";

const input = {
  customerName: "Ana & João <cliente>",
  customerEmail: "ana@example.com",
  businessName: "Barbearia \"Demo\"",
  serviceName: "Corte <premium>",
  startAt: "2026-05-10T18:00:00Z",
  timezone: "America/Sao_Paulo",
  publicCode: "65925DBB",
  rebookUrl: "https://agenda.example/barbearia?ref=cancelamento&x=1",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendBusinessCancelledEmail", () => {
  it("tells the cliente which reserva was cancelled and how to reserve again", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendBusinessCancelledEmail(input)).resolves.toEqual({ sent: true });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      from: "AgendFined <reservas@example.com>",
      to: ["ana@example.com"],
      subject: "Sua reserva foi cancelada",
    });
    expect(request.text).toContain("Ana & João <cliente>");
    expect(request.text).toContain("Barbearia \"Demo\" cancelou a sua reserva");
    expect(request.text).toContain("Corte <premium>");
    expect(request.text).toContain("10/05/2026 às 15:00 (horário de Brasília, UTC−3)");
    expect(request.text).toContain("6592-5DBB");
    expect(request.text).toContain(input.rebookUrl);
    expect(request.html).toContain("CANCELAMENTO DE RESERVA");
    expect(request.html).toContain("background-color:#141414");
    expect(request.html).toContain("Ana &amp; João &lt;cliente&gt;");
    expect(request.html).toContain("Barbearia &quot;Demo&quot;");
    expect(request.html).toContain("Corte &lt;premium&gt;");
    expect(request.html).toContain("10/05/2026 às 15:00");
    expect(request.html).toContain("6592-5DBB");
    expect(request.html).toContain("https://agenda.example/barbearia?ref=cancelamento&amp;x=1");
    expect(request.html).not.toContain("<cliente>");
  });

  it("never carries a cancel capability", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendBusinessCancelledEmail(input);

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain("cancel=");
    expect(body).not.toContain("confirmacao");
  });

  it("reports a missing configuration without calling the provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendBusinessCancelledEmail(input)).resolves.toEqual({ sent: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps provider failures non-throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(sendBusinessCancelledEmail(input)).resolves.toEqual({ sent: false, reason: "provider_error" });
  });
});

describe("sendCustomerCancelledEmail", () => {
  it("confirms to the cliente that they cancelled the reserva themselves", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendCustomerCancelledEmail(input)).resolves.toEqual({ sent: true });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      from: "AgendFined <reservas@example.com>",
      to: ["ana@example.com"],
      subject: "Você cancelou sua reserva",
    });
    expect(request.text).toContain("Ana & João <cliente>");
    expect(request.text).toContain("Você cancelou sua reserva com Barbearia \"Demo\"");
    expect(request.text).not.toContain("cancelou a sua reserva");
    expect(request.text).toContain("Corte <premium>");
    expect(request.text).toContain("10/05/2026 às 15:00");
    expect(request.text).toContain("6592-5DBB");
    expect(request.text).toContain(input.rebookUrl);
    expect(request.html).toContain("Você cancelou sua reserva.");
    expect(request.html).toContain("Ana &amp; João &lt;cliente&gt;");
    expect(request.html).toContain("Barbearia &quot;Demo&quot;");
    expect(request.html).toContain("Corte &lt;premium&gt;");
    expect(request.html).toContain("10/05/2026 às 15:00");
    expect(request.html).toContain("6592-5DBB");
    expect(request.html).toContain("https://agenda.example/barbearia?ref=cancelamento&amp;x=1");
    expect(request.html).not.toContain("<cliente>");
  });

  it("never carries a cancel capability", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendCustomerCancelledEmail(input);

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain("cancel=");
    expect(body).not.toContain("confirmacao");
  });

  it("keeps provider failures non-throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(sendCustomerCancelledEmail(input)).resolves.toEqual({ sent: false, reason: "provider_error" });
  });
});

describe("contato do negócio no cancelamento (#149)", () => {
  it("traz o telefone do negócio junto do \"fale diretamente\"", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendBusinessCancelledEmail({ ...input, businessPhone: "1133334444" });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.html).toContain('href="tel:+551133334444"');
    expect(request.html).not.toContain("wa.me");
    expect(request.text).toContain("Telefone do negócio: (11) 3333-4444");
  });

  it("omite o contato quando o negócio não tem telefone", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendCustomerCancelledEmail(input);

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.html).not.toContain("TELEFONE DO NEGÓCIO");
  });
});

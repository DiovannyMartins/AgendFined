import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBookingConfirmationEmail } from "@/lib/email/booking-confirmation";
import { EMAIL_LOGO_HTML } from "@/lib/email/brand-logo";

const input = {
  customerName: "Ana & João <cliente>",
  customerEmail: "ana@example.com",
  businessName: "Barbearia \"Demo\"",
  serviceName: "Corte <premium>",
  startAt: "2026-05-10T18:00:00Z",
  publicCode: "65925DBB",
  confirmationUrl: "https://agenda.example/barbearia/confirmacao?code=65925DBB#cancel=private_token",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendBookingConfirmationEmail", () => {
  it("sends a branded HTML representation and preserves the plain-text fallback", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendBookingConfirmationEmail(input)).resolves.toEqual({ sent: true });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      from: "AgendFined <reservas@example.com>",
      to: ["ana@example.com"],
      subject: "Sua reserva foi confirmada",
    });
    expect(request.text).toContain("Ana & João <cliente>");
    expect(request.text).toContain("Barbearia \"Demo\"");
    expect(request.text).toContain("Corte <premium>");
    expect(request.text).toContain("10/05/2026 às 15:00 (horário de Brasília, UTC−3)");
    expect(request.text).toContain("Código da reserva: 6592-5DBB");
    expect(request.text).toContain(input.confirmationUrl);
    expect(request.html).toContain(EMAIL_LOGO_HTML);
    expect(request.html).toContain("#141414");
    expect(request.html).toContain("#1c1c1c");
    expect(request.html).toContain("#eeeeee");
    expect(request.html).toContain("#b0b0b0");
    expect(request.html).toContain("#333333");
    expect(request.html).toContain("Ana &amp; João &lt;cliente&gt;");
    expect(request.html).toContain("Barbearia &quot;Demo&quot;");
    expect(request.html).toContain("Corte &lt;premium&gt;");
    expect(request.html).toContain("cancel=private_token");
    expect(request.html).not.toContain("&amp;cancel=");
    expect(request.html).not.toContain("<cliente>");
  });

  it("keeps the existing not-configured result", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    await expect(sendBookingConfirmationEmail(input)).resolves.toEqual({
      sent: false,
      reason: "not_configured",
    });
  });

  it("keeps provider failures non-throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));

    await expect(sendBookingConfirmationEmail(input)).resolves.toEqual({
      sent: false,
      reason: "provider_error",
    });
  });

  // #149: o código vem agrupado como na tela, e o e-mail traz como falar com o negócio.
  it("agrupa o código e traz o telefone e o WhatsApp do negócio", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendBookingConfirmationEmail({ ...input, businessPhone: "51998765432" });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.html).toContain("6592-5DBB");
    expect(request.html).not.toContain(">65925DBB<");
    expect(request.html).toContain('href="tel:+5551998765432"');
    expect(request.html).toContain('href="https://wa.me/5551998765432"');
    expect(request.text).toContain("Telefone do negócio: (51) 99876-5432");
    expect(request.text).toContain("WhatsApp: https://wa.me/5551998765432");
  });
});

// #196: o cliente salva a reserva na agenda direto do e-mail.
describe("sendBookingConfirmationEmail calendar link", () => {
  it("links the reserva's .ics without the cancel capability", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendBookingConfirmationEmail(input);

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const icsUrl = "https://agenda.example/barbearia/confirmacao/evento.ics?code=65925DBB";
    expect(request.text).toContain(`Adicionar à minha agenda: ${icsUrl}`);
    expect(request.html).toContain(`href="${icsUrl}"`);
    expect(request.html).toContain("Adicionar à minha agenda</a>");
    expect(request.html.match(/private_token/g)).toHaveLength(1);
  });
});

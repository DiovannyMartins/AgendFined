import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBookingConfirmationEmail } from "@/lib/email/booking-confirmation";

const input = {
  customerName: "Ana & João <cliente>",
  customerEmail: "ana@example.com",
  businessName: "Barbearia \"Demo\"",
  serviceName: "Corte <premium>",
  startAt: "2026-05-10T18:00:00Z",
  publicCode: "65925DBB",
  confirmationUrl: "https://agenda.example/barbearia/confirmacao?code=65925DBB&cancel=private_token",
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
    expect(request.text).toContain("10/05/2026 às 15:00");
    expect(request.text).toContain("65925DBB");
    expect(request.text).toContain(input.confirmationUrl);
    expect(request.html).toContain("AgendFined");
    expect(request.html).toContain("#141414");
    expect(request.html).toContain("#1c1c1c");
    expect(request.html).toContain("#eeeeee");
    expect(request.html).toContain("#b0b0b0");
    expect(request.html).toContain("#333333");
    expect(request.html).toContain("Ana &amp; João &lt;cliente&gt;");
    expect(request.html).toContain("Barbearia &quot;Demo&quot;");
    expect(request.html).toContain("Corte &lt;premium&gt;");
    expect(request.html).toContain("cancel=private_token");
    expect(request.html).toContain("&amp;cancel=");
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
});

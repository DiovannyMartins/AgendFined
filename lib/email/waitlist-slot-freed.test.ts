import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWaitlistSlotFreedEmail } from "@/lib/email/waitlist-slot-freed";

const input = {
  customerName: "Bruna <cliente>",
  customerEmail: "bruna@example.com",
  businessName: "Barbearia \"Demo\"",
  serviceName: "Corte & barba",
  startAt: "2026-10-27T16:00:00Z",
  timezone: "America/Sao_Paulo",
  bookingUrl: "https://agenda.example/barbearia-demo",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendWaitlistSlotFreedEmail", () => {
  it("tells the cliente the horário is free but not yet hers, with the link to reserve", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendWaitlistSlotFreedEmail(input)).resolves.toEqual({ sent: true });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      to: ["bruna@example.com"],
      subject: "O horário que você esperava ficou livre",
    });
    expect(request.text).toContain("Olá, Bruna <cliente>!");
    expect(request.text).toContain("Data e horário: 27/10/2026 às 13:00 (horário de Brasília, UTC−3)");
    expect(request.text).toContain("Serviço: Corte & barba");
    expect(request.text).toContain("ainda não está reservado para você");
    expect(request.text).toContain("Reservar este horário: https://agenda.example/barbearia-demo");
    expect(request.html).toContain("Bruna &lt;cliente&gt;");
    expect(request.html).toContain("Barbearia &quot;Demo&quot;");
    expect(request.html).toContain("Corte &amp; barba");
    expect(request.html).toContain('href="https://agenda.example/barbearia-demo"');
  });

  it("reports when e-mail delivery is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendWaitlistSlotFreedEmail(input)).resolves.toEqual({ sent: false, reason: "not_configured" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWaitlistJoinedEmail } from "@/lib/email/waitlist-joined";

const leaveUrl = `https://agenda.example/barbearia-demo/lista-de-espera/sair#token=${"A".repeat(43)}`;

const input = {
  customerName: "Bruna <cliente>",
  customerEmail: "bruna@example.com",
  businessName: "Barbearia \"Demo\"",
  serviceName: "Corte & barba",
  startAt: "2026-10-27T16:00:00Z",
  timezone: "America/Sao_Paulo",
  leaveUrl,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendWaitlistJoinedEmail", () => {
  it("confirms the entrada with the horário and the private link to leave the list", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendWaitlistJoinedEmail({ ...input, businessPhone: "11987654321" })).resolves.toEqual({ sent: true });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      to: ["bruna@example.com"],
      subject: "Você está na lista de espera",
    });
    expect(request.text).toContain("Olá, Bruna <cliente>!");
    expect(request.text).toContain("Data e horário: 27/10/2026 às 13:00 (horário de Brasília, UTC−3)");
    expect(request.text).toContain("Serviço: Corte & barba");
    expect(request.text).toContain("ainda não está reservado para você");
    expect(request.text).toContain(`Sair da lista de espera (link pessoal, não compartilhe): ${leaveUrl}`);
    expect(request.text).toContain("(11) 98765-4321");
    expect(request.html).toContain("Bruna &lt;cliente&gt;");
    expect(request.html).toContain("Barbearia &quot;Demo&quot;");
    expect(request.html).toContain("Corte &amp; barba");
    expect(request.html).toContain(`href="${leaveUrl}"`);
  });

  it("reports when e-mail delivery is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendWaitlistJoinedEmail(input)).resolves.toEqual({ sent: false, reason: "not_configured" });
  });
});

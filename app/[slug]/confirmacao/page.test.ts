import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceConsultRateLimit: async () => true,
  getClientIp: async () => "1.2.3.4",
}));

const { generateMetadata } = await import("./page");

function bookingRow(status: string) {
  return {
    service_name: "Corte",
    start_at: "2026-09-01T20:00:00.000Z",
    end_at: "2026-09-01T20:30:00.000Z",
    business_name: "Barbearia Demo",
    business_slug: "barbearia",
    business_phone: "+5511987654321",
    business_timezone: "America/Sao_Paulo",
    status,
  };
}

function props(code: string | undefined, slug = "barbearia") {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve({ code }) };
}

// A página de confirmação (/[slug]/confirmacao) tem <title> próprio por status (#110).
describe("confirmation page <title>", () => {
  beforeEach(() => rpc.mockReset());

  it.each([
    ["confirmed", "Reserva confirmada — AgendFined"],
    ["cancelled", "Reserva cancelada — AgendFined"],
    ["completed", "Reserva concluída — AgendFined"],
    ["no_show", "Não comparecimento registrado — AgendFined"],
  ])("follows the %s status", async (status, title) => {
    rpc.mockResolvedValue({ data: [bookingRow(status)], error: null });

    const metadata = await generateMetadata(props("65925DBB"));

    expect(metadata.title).toBe(title);
  });

  it("never claims a confirmed booking when the code resolves to nothing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const metadata = await generateMetadata(props("65925DBB"));

    expect(metadata.title).toBe("Reserva — AgendFined");
  });
});

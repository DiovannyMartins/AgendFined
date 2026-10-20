import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceConsultRateLimit: async () => true,
  getClientIp: async () => "1.2.3.4",
}));

vi.mock("./current-slug-redirect", () => ({ CurrentSlugRedirect: () => null }));

const { generateMetadata, default: ConfirmationPage } = await import("./page");
const { CurrentSlugRedirect } = await import("./current-slug-redirect");

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

type ContentProps = { code: string; slug: string };
type ContentElement = ReactElement<ContentProps, (props: ContentProps) => Promise<ReactElement>>;

// Resolves the async content the page wraps in <Suspense>, one level deep.
async function renderContent(code: string, slug: string) {
  const page = (await ConfirmationPage(props(code, slug))) as ReactElement<{ children: ContentElement }>;
  const content = page.props.children;
  return content.type(content.props);
}

// #124: links já enviados carregam o slug antigo depois que o negócio o troca.
describe("confirmation page after a slug change", () => {
  beforeEach(() => rpc.mockReset());

  it("sends an old-slug link to the negócio's current slug instead of a 404", async () => {
    rpc.mockResolvedValue({ data: [bookingRow("confirmed")], error: null });

    const element = (await renderContent("65925DBB", "barbearia-antiga")) as ReactElement<{ slug: string }>;

    expect(element.type).toBe(CurrentSlugRedirect);
    expect(element.props.slug).toBe("barbearia");
  });

  it("keeps the current slug on the normal confirmation screen", async () => {
    rpc.mockResolvedValue({ data: [bookingRow("confirmed")], error: null });

    const element = await renderContent("65925DBB", "barbearia");

    expect(element.type).not.toBe(CurrentSlugRedirect);
  });

  it("still answers 404 when the code resolves to nothing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(renderContent("65925DBB", "barbearia-antiga")).rejects.toThrow();
  });
});

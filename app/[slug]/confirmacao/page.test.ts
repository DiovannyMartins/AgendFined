import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

vi.mock("./current-slug-redirect", () => ({ CurrentSlugRedirect: () => null }));

const { generateMetadata, default: ConfirmationPage } = await import("./page");
const { CurrentSlugRedirect } = await import("./current-slug-redirect");
const { CONFIRMATION_UNAVAILABLE, ConfirmationLookupError } = await import("./confirmation-errors");

const FUTURE_START = new Date(Date.now() + 7 * 24 * 60 * 60_000);
const PAST_START = new Date(Date.now() - 60 * 60_000);

function bookingRow(status: string, startAt = FUTURE_START) {
  return {
    service_name: "Corte",
    start_at: startAt.toISOString(),
    end_at: new Date(startAt.getTime() + 30 * 60_000).toISOString(),
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

  // #141: a confirmed reserva that already started is no longer a guaranteed slot.
  it("says the horário has passed for a confirmed booking that already started", async () => {
    rpc.mockResolvedValue({ data: [bookingRow("confirmed", PAST_START)], error: null });

    const metadata = await generateMetadata(props("65925DBB"));

    expect(metadata.title).toBe("Este horário já passou — AgendFined");
  });

  it("never claims a confirmed booking when the code resolves to nothing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const metadata = await generateMetadata(props("65925DBB"));

    expect(metadata.title).toBe("Reserva — AgendFined");
  });
});

type ContentProps = Record<string, unknown>;
type ContentElement = ReactElement<ContentProps, (props: ContentProps) => ReactElement>;

// Renders the content component the page returns, one level deep.
async function renderContent(code: string, slug: string) {
  const content = (await ConfirmationPage(props(code, slug))) as ContentElement;
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

  // #128: an unknown code must answer HTTP 404, so the lookup runs before any
  // streaming starts (a notFound() inside <Suspense> keeps the 200 status).
  it("throws notFound from the page itself for an unknown code", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(ConfirmationPage(props("ZZZZZZZZ", "barbearia"))).rejects.toThrow();
  });

  it("still answers 404 when the code resolves to nothing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(renderContent("65925DBB", "barbearia-antiga")).rejects.toThrow();
  });
});

// Digest that Next maps to the 404 status, and the status it gives any other
// error thrown before streaming starts.
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";

async function pageFailure(code = "65925DBB") {
  try {
    await ConfirmationPage(props(code, "barbearia"));
  } catch (error) {
    return error as Error & { digest?: string };
  }
  throw new Error("expected the page to throw");
}

// #140: uma reserva gravada nunca pode virar "página não existe" só porque a
// consulta falhou. O limite de consultas fica no proxy, que responde 429/503
// antes da página (#179); aqui a página não conta de novo.
describe("confirmation page when the lookup cannot answer", () => {
  beforeEach(() => rpc.mockReset());

  it("answers 404 for an unknown code", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const error = await pageFailure();

    expect(error.digest).toBe(NOT_FOUND_DIGEST);
  });

  it("answers 404 for a malformed code without a lookup", async () => {
    const error = await pageFailure("123");

    expect(error.digest).toBe(NOT_FOUND_DIGEST);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a database error as a temporary failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    const error = await pageFailure();

    expect(error).toBeInstanceOf(ConfirmationLookupError);
    expect(error.digest).toBe(CONFIRMATION_UNAVAILABLE);
  });

  it("keeps the neutral <title> when the lookup fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    const metadata = await generateMetadata(props("65925DBB"));

    expect(metadata.title).toBe("Reserva — AgendFined");
  });
});

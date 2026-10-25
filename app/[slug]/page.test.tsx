import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const barbearia = {
  id: "biz-1",
  name: "Barbearia",
  slug: "barbearia",
  description: null,
  timezone: "America/Sao_Paulo",
  search_indexing_enabled: true,
};

const { state, navigation } = vi.hoisted(() => ({
  state: {
    businesses: [] as Array<Record<string, unknown>>,
    businessError: null as { message: string } | null,
    previousSlugTarget: [] as Array<{ slug: string }>,
    previousSlugError: null as { message: string } | null,
    services: [] as Array<Record<string, unknown>>,
    hasAvailability: true,
  },
  navigation: {
    permanentRedirect: vi.fn((path: string) => {
      throw new Error(`NEXT_REDIRECT:308:${path}`);
    }),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  },
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string) => {
      if (name === "get_public_business") {
        return state.businessError
          ? { data: null, error: state.businessError }
          : { data: state.businesses, error: null };
      }
      if (name === "get_business_slug_redirect") {
        return state.previousSlugError
          ? { data: null, error: state.previousSlugError }
          : { data: state.previousSlugTarget, error: null };
      }
      return { data: state.services, error: null };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: "BASICO", phone: "11988887777" } }) }) }) }),
  }),
}));
vi.mock("@/lib/business/readiness", () => ({
  hasActiveAvailability: async () => state.hasAvailability,
}));
vi.mock("./booking-widget", () => ({ BookingWidget: () => <form aria-label="Formulário de reserva" /> }));

import PublicPage, { generateMetadata } from "./page";

const corte = { id: "svc-1", name: "Corte", description: null, duration_minutes: 30, price_cents: 5000 };

async function renderPage(slug = "barbearia") {
  render(await PublicPage({ params: Promise.resolve({ slug }) }));
}

describe("página pública do negócio", () => {
  beforeEach(() => {
    state.businesses = [barbearia];
    state.businessError = null;
    state.previousSlugTarget = [];
    state.previousSlugError = null;
    state.services = [corte];
    state.hasAvailability = true;
  });

  it("mostra um estado vazio, sem formulário, quando não há serviços ativos", async () => {
    state.services = [];

    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Este negócio ainda não está recebendo reservas online" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Formulário de reserva" })).not.toBeInTheDocument();
  });

  it("avisa que não há horários configurados quando falta disponibilidade recorrente", async () => {
    state.hasAvailability = false;

    await renderPage();

    expect(screen.getByRole("heading", { name: "Ainda não há horários configurados" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Formulário de reserva" })).not.toBeInTheDocument();
  });

  it("mostra o formulário quando há serviço e disponibilidade", async () => {
    await renderPage();

    expect(screen.getByRole("form", { name: "Formulário de reserva" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("mostra o telefone e o WhatsApp do negócio quando ainda não há serviços", async () => {
    state.services = [];

    await renderPage();

    expect(screen.getByRole("link", { name: "(11) 98888-7777" })).toHaveAttribute("href", "tel:+5511988887777");
    expect(screen.getByRole("link", { name: "Conversar no WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511988887777",
    );
  });

  it("mantém o link para consultar uma reserva existente mesmo sem serviços", async () => {
    state.services = [];

    await renderPage();

    expect(screen.getByRole("link", { name: "Consultar reserva" })).toHaveAttribute("href", "/barbearia/consultar");
  });

  // Slug antigo (ADR 0007): o link divulgado antes da troca leva ao slug atual.
  it("redireciona permanentemente um slug antigo para o slug atual", async () => {
    state.businesses = [];
    state.previousSlugTarget = [{ slug: "barbearia-nova" }];

    await expect(renderPage("barbearia")).rejects.toThrow("NEXT_REDIRECT:308:/barbearia-nova");
  });

  // #197: uma falha do banco não vira 404; quem responde é o error.tsx do segmento.
  it("lança erro, e não 404, quando a busca do negócio falha", async () => {
    state.businessError = { message: "fetch failed" };

    await expect(renderPage()).rejects.toThrow("PUBLIC_BUSINESS_LOOKUP_FAILED");
  });

  it("dá 404 quando o slug não é atual nem antigo", async () => {
    state.businesses = [];

    await expect(renderPage("nao-existe")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  // O slug já não existe; uma falha só na busca do histórico não vira erro 500.
  it("dá 404 quando a busca do slug antigo falha", async () => {
    state.businesses = [];
    state.previousSlugError = { message: "Could not find the function" };

    await expect(renderPage("nao-existe")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("metadados da página pública do negócio", () => {
  beforeEach(() => {
    state.businesses = [barbearia];
    state.businessError = null;
  });

  async function metadataFor(slug = "barbearia") {
    return generateMetadata({ params: Promise.resolve({ slug }) });
  }

  it("deixa buscadores indexarem um negócio liberado", async () => {
    const metadata = await metadataFor();

    expect(metadata.title).toBe("Barbearia — AgendFined");
    expect(metadata.robots).toBeUndefined();
  });

  // Negócio de teste em produção: a página funciona, mas fica fora do Google.
  it("pede aos buscadores para não indexar um negócio fora da busca", async () => {
    state.businesses = [{ ...barbearia, search_indexing_enabled: false }];

    const metadata = await metadataFor();

    expect(metadata.title).toBe("Barbearia — AgendFined");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  // #197: a aba não diz "Página não encontrada" numa página que existe.
  it("usa um título neutro quando a busca do negócio falha", async () => {
    state.businessError = { message: "fetch failed" };

    const metadata = await metadataFor();

    expect(metadata.title).toBe("Agendamento online — AgendFined");
    expect(metadata.robots).toBeUndefined();
  });

  it("marca como não encontrada só quando o negócio não existe", async () => {
    state.businesses = [];

    const metadata = await metadataFor("nao-existe");

    expect(metadata.title).toBe("Página não encontrada — AgendFined");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

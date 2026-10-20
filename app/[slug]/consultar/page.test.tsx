import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, navigation } = vi.hoisted(() => ({
  state: {
    businesses: [] as Array<Record<string, unknown>>,
    previousSlugTarget: [] as Array<{ slug: string }>,
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
    rpc: async (name: string) =>
      name === "get_public_business"
        ? { data: state.businesses, error: null }
        : { data: state.previousSlugTarget, error: null },
  }),
}));
vi.mock("./consultar-form", () => ({
  ConsultarForm: ({ slug }: { slug: string }) => <form aria-label={`Consultar em ${slug}`} />,
}));

import ConsultarPage from "./page";

async function renderPage(slug: string) {
  render(await ConsultarPage({ params: Promise.resolve({ slug }) }));
}

describe("consulta pública de reserva", () => {
  beforeEach(() => {
    state.businesses = [{ id: "biz-1", name: "Barbearia", slug: "barbearia", description: null, timezone: "America/Sao_Paulo" }];
    state.previousSlugTarget = [];
  });

  it("mostra o formulário no slug atual", async () => {
    await renderPage("barbearia");

    expect(screen.getByRole("form", { name: "Consultar em barbearia" })).toBeInTheDocument();
  });

  // Slug antigo (ADR 0007): o link divulgado antes da troca leva ao slug atual.
  it("redireciona permanentemente um slug antigo para a consulta no slug atual", async () => {
    state.businesses = [];
    state.previousSlugTarget = [{ slug: "barbearia-nova" }];

    await expect(renderPage("barbearia")).rejects.toThrow("NEXT_REDIRECT:308:/barbearia-nova/consultar");
  });

  it("dá 404 quando o slug não é atual nem antigo", async () => {
    state.businesses = [];

    await expect(renderPage("nao-existe")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    services: [] as Array<Record<string, unknown>>,
    hasAvailability: true,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string) =>
      name === "get_public_business"
        ? { data: [{ id: "biz-1", name: "Barbearia", description: null, timezone: "America/Sao_Paulo" }], error: null }
        : { data: state.services, error: null },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: "BASICO" } }) }) }) }),
  }),
}));
vi.mock("@/lib/business/readiness", () => ({
  hasActiveAvailability: async () => state.hasAvailability,
}));
vi.mock("./booking-widget", () => ({ BookingWidget: () => <form aria-label="Formulário de reserva" /> }));

import PublicPage from "./page";

const corte = { id: "svc-1", name: "Corte", description: null, duration_minutes: 30, price_cents: 5000 };

async function renderPage() {
  render(await PublicPage({ params: Promise.resolve({ slug: "barbearia" }) }));
}

describe("página pública do negócio", () => {
  beforeEach(() => {
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

  it("mantém o link para consultar uma reserva existente mesmo sem serviços", async () => {
    state.services = [];

    await renderPage();

    expect(screen.getByRole("link", { name: "Consultar reserva" })).toHaveAttribute("href", "/barbearia/consultar");
  });
});

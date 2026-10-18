import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { readiness: { hasActiveService: false, hasAvailability: false } },
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/business/queries", () => ({
  getCurrentBusiness: async () => ({ id: "biz-1", name: "Barbearia", slug: "barbearia" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/business/readiness", () => ({ getBookingReadiness: async () => state.readiness }));
vi.mock("@/components/public-link-qr", () => ({
  PublicLinkQR: () => null,
  DownloadPublicLinkQRButton: () => null,
}));

import DashboardHome from "./page";

const CHECKLIST = "Sua página ainda não aceita reservas";

async function renderDashboard() {
  render(await DashboardHome());
}

describe("painel do negócio", () => {
  beforeEach(() => {
    state.readiness = { hasActiveService: false, hasAvailability: false };
  });

  it("orienta um negócio novo a cadastrar serviço e disponibilidade", async () => {
    await renderDashboard();

    expect(screen.getByRole("heading", { name: CHECKLIST })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cadastrar serviço/ })).toHaveAttribute("href", "/dashboard/servicos");
    expect(screen.getByRole("link", { name: /Configurar disponibilidade/ })).toHaveAttribute(
      "href",
      "/dashboard/configuracoes#disponibilidade",
    );
  });

  it("marca o serviço como concluído e mantém o passo de disponibilidade", async () => {
    state.readiness = { hasActiveService: true, hasAvailability: false };

    await renderDashboard();

    expect(screen.getByText(/Cadastre um serviço/)).toHaveTextContent("(concluído)");
    expect(screen.queryByRole("link", { name: /Cadastrar serviço/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Configurar disponibilidade/ })).toBeInTheDocument();
  });

  it("esconde o checklist quando tudo está configurado", async () => {
    state.readiness = { hasActiveService: true, hasAvailability: true };

    await renderDashboard();

    expect(screen.queryByRole("heading", { name: CHECKLIST })).not.toBeInTheDocument();
  });
});

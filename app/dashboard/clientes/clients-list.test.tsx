import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientsList } from "./clients-list";

vi.mock("@/lib/customers/search", () => ({ semanticSearchCustomers: vi.fn() }));
vi.mock("@/lib/customers/history-actions", () => ({
  loadCustomerBookings: vi.fn(async () => [
    {
      id: "b1",
      customer_id: "c1",
      start_at: "2026-09-01T10:00:00Z",
      status: "completed",
      service_name_snapshot: "Corte",
      duration_minutes_snapshot: 30,
    },
  ]),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

describe("ClientsList", () => {
  it("dá à busca um nome acessível que não depende do placeholder", () => {
    render(<ClientsList customers={[]} timezone="America/Sao_Paulo" />);

    expect(screen.getByRole("searchbox", { name: "Buscar clientes" })).toBeInTheDocument();
  });

  it("mostra a contagem vinda do banco e pagina", () => {
    render(
      <ClientsList
        customers={[{ id: "c1", name: "Eli", phone: "+5511900000001", email: null, booking_count: 1200 }]}
        timezone="America/Sao_Paulo"
        page={2}
        totalPages={3}
      />,
    );

    expect(screen.getByText("1200 reservas")).toBeInTheDocument();
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", "/dashboard/clientes?pagina=3");
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/dashboard/clientes");
  });

  it("abre o histórico do cliente e o carrega sob demanda", async () => {
    render(
      <ClientsList
        customers={[{ id: "c1", name: "Eli", phone: "+5511900000001", email: null, booking_count: 1 }]}
        timezone="America/Sao_Paulo"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Eli/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Corte · 30 min/)).toBeInTheDocument());
  });
});

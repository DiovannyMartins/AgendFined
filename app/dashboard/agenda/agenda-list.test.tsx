import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgendaBooking } from "@/lib/agenda/view";
import { AgendaList } from "./agenda-list";

vi.mock("./status-action", () => ({ StatusAction: () => null }));

function booking(overrides: Partial<AgendaBooking> = {}): AgendaBooking {
  return {
    id: "b1",
    start_at: "2026-10-20T13:00:00.000Z",
    end_at: "2026-10-20T14:00:00.000Z",
    status: "confirmed",
    service_name_snapshot: "Manicure",
    duration_minutes_snapshot: 60,
    customer_name_snapshot: "Ana",
    customer_phone_snapshot: "11999990000",
    public_code: "ABC123",
    ...overrides,
  };
}

describe("AgendaList", () => {
  it("dá à busca um nome acessível que não depende do placeholder", () => {
    render(<AgendaList bookings={[]} timezone="America/Sao_Paulo" />);

    expect(screen.getByRole("searchbox", { name: "Buscar reservas" })).toBeInTheDocument();
  });

  it("mostra a observação do cliente na reserva", () => {
    render(
      <AgendaList
        bookings={[booking({ customer_note: "Sou alergica a acetona" })]}
        timezone="America/Sao_Paulo"
      />,
    );

    expect(screen.getByText("Sou alergica a acetona")).toBeInTheDocument();
  });

  it("exibe observação com HTML como texto, sem interpretar a marcação", () => {
    const note = '<script>alert("x")</script><b>negrito</b>';
    const { container } = render(
      <AgendaList bookings={[booking({ customer_note: note })]} timezone="America/Sao_Paulo" />,
    );

    expect(screen.getByText(note)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("quebra observações longas em vez de estourar o layout", () => {
    const note = "a".repeat(500);
    render(<AgendaList bookings={[booking({ customer_note: note })]} timezone="America/Sao_Paulo" />);

    expect(screen.getByText(note)).toHaveClass("break-words", "whitespace-pre-line");
  });

  it("não mostra bloco de observação quando ela está vazia", () => {
    render(<AgendaList bookings={[booking({ customer_note: "   " })]} timezone="America/Sao_Paulo" />);

    expect(screen.queryByText(/Observação:/)).not.toBeInTheDocument();
  });
});

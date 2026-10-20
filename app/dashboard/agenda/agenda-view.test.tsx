import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgendaView } from "./agenda-view";
import type { AgendaBooking } from "@/lib/agenda/view";

vi.mock("./status-action", () => ({
  StatusAction: () => null,
}));

function booking(over: Partial<AgendaBooking> & { id: string }): AgendaBooking {
  const startAt = over.start_at ?? "2026-09-20T11:00:00.000Z";
  return {
    id: over.id,
    start_at: startAt,
    end_at: over.end_at ?? "2026-09-20T11:30:00.000Z",
    status: over.status ?? "confirmed",
    service_name_snapshot: over.service_name_snapshot ?? "Corte",
    duration_minutes_snapshot: over.duration_minutes_snapshot ?? 30,
    customer_name_snapshot: over.customer_name_snapshot ?? "Maria",
    customer_phone_snapshot: over.customer_phone_snapshot ?? "+5511900000000",
    public_code: over.public_code ?? "ABCDEFGH",
    cancel_reason: over.cancel_reason ?? null,
  };
}

describe("AgendaView list view", () => {
  it("shows all reservations by default (the date is an optional filter)", () => {
    const onDay = booking({ id: "a", start_at: "2026-09-20T11:00:00.000Z", customer_name_snapshot: "Joana" });
    const offDay = booking({ id: "b", start_at: "2026-09-21T11:00:00.000Z", customer_name_snapshot: "Pedro" });

    render(
      <AgendaView
        bookings={[onDay, offDay]}
      />,
    );

    expect(screen.getByText(/Joana/)).toBeInTheDocument();
    expect(screen.getByText(/Pedro/)).toBeInTheDocument();
  });

  it("filters the list by the selected date", () => {
    const onDay = booking({ id: "a", start_at: "2026-09-20T11:00:00.000Z", customer_name_snapshot: "Joana" });
    const offDay = booking({ id: "b", start_at: "2026-09-21T11:00:00.000Z", customer_name_snapshot: "Pedro" });

    render(
      <AgendaView
        bookings={[onDay, offDay]}
      />,
    );

    // The date control must be live in the list view too.
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-20" } });

    expect(screen.getByText(/Joana/)).toBeInTheDocument();
    expect(screen.queryByText(/Pedro/)).not.toBeInTheDocument();
  });

  it("clears the date filter back to all reservations", () => {
    const onDay = booking({ id: "a", start_at: "2026-09-20T11:00:00.000Z", customer_name_snapshot: "Joana" });
    const offDay = booking({ id: "b", start_at: "2026-09-21T11:00:00.000Z", customer_name_snapshot: "Pedro" });

    render(
      <AgendaView
        bookings={[onDay, offDay]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-20" } });
    expect(screen.queryByText(/Pedro/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Todas as datas/ }));

    expect(screen.getByText(/Joana/)).toBeInTheDocument();
    expect(screen.getByText(/Pedro/)).toBeInTheDocument();
  });
});

describe("AgendaView filtros", () => {
  it("diz que nada bate com o filtro quando há reservas fora dele", () => {
    render(<AgendaView bookings={[booking({ id: "a" })]} initialStatus="completed" />);

    expect(screen.getByText(/Nenhuma reserva com esse filtro/)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma reserva ainda/)).not.toBeInTheDocument();
  });

  it("começa com os filtros vindos da URL e os mantém na URL", () => {
    const onDay = booking({ id: "a", start_at: "2026-09-20T11:00:00.000Z", customer_name_snapshot: "Joana" });
    const offDay = booking({ id: "b", start_at: "2026-09-21T11:00:00.000Z", customer_name_snapshot: "Pedro" });

    render(<AgendaView bookings={[onDay, offDay]} initialDate="2026-09-20" />);

    expect(screen.getByText(/Joana/)).toBeInTheDocument();
    expect(screen.queryByText(/Pedro/)).not.toBeInTheDocument();
    expect(window.location.search).toBe("?data=2026-09-20");

    fireEvent.click(screen.getByRole("button", { name: /Todas as datas/ }));
    expect(window.location.search).toBe("");
  });

  it("informa qual atalho de data está ativo", () => {
    render(<AgendaView bookings={[]} />);

    expect(screen.getByRole("button", { name: "Todas as datas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));

    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Todas as datas" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("AgendaView acessibilidade", () => {
  it("dá nome ao filtro de status", () => {
    render(<AgendaView bookings={[]} />);

    expect(screen.getByRole("combobox", { name: "Filtrar por status" })).toBeInTheDocument();
  });
});

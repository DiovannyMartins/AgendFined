import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgendaView } from "./agenda-view";
import type { AgendaBooking } from "@/lib/agenda/view";

vi.mock("./status-action", () => ({
  StatusAction: () => null,
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockClear();
  window.history.replaceState(null, "", "/dashboard/agenda");
});

function booking(over: Partial<AgendaBooking> & { id: string }): AgendaBooking {
  return {
    id: over.id,
    start_at: over.start_at ?? "2026-09-20T11:00:00.000Z",
    status: over.status ?? "confirmed",
    service_name_snapshot: over.service_name_snapshot ?? "Corte",
    duration_minutes_snapshot: over.duration_minutes_snapshot ?? 30,
    customer_name_snapshot: over.customer_name_snapshot ?? "Maria",
    customer_phone_snapshot: over.customer_phone_snapshot ?? "+5511900000000",
    has_email: over.has_email ?? false,
    public_code: over.public_code ?? "ABCDEFGH",
    cancel_reason: over.cancel_reason ?? null,
  };
}

// 2026-09-14 (Mon) .. 2026-09-20 (Sun) is one week; the 21st opens the next.
const sunday = booking({ id: "a", start_at: "2026-09-20T13:00:00.000Z", customer_name_snapshot: "Joana" });
const saturday = booking({ id: "b", start_at: "2026-09-19T13:00:00.000Z", customer_name_snapshot: "Pedro" });

describe("AgendaView semana", () => {
  it("lista o dia escolhido e conta os outros dias da semana", () => {
    render(<AgendaView bookings={[sunday, saturday]} initialDate="2026-09-20" />);

    expect(screen.getByText(/Joana/)).toBeInTheDocument();
    expect(screen.queryByText(/Pedro/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sáb 19/09: 1 reserva" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seg 14/09: 0 reservas" })).toBeInTheDocument();
  });

  it("troca de dia dentro da semana sem buscar no servidor", () => {
    render(<AgendaView bookings={[sunday, saturday]} initialDate="2026-09-20" />);

    fireEvent.click(screen.getByRole("button", { name: /^Sáb 19\/09/ }));

    expect(screen.getByText(/Pedro/)).toBeInTheDocument();
    expect(screen.queryByText(/Joana/)).not.toBeInTheDocument();
    expect(window.location.search).toBe("?data=2026-09-19");
    expect(push).not.toHaveBeenCalled();
  });

  it("navega por semana, pedindo ao servidor a semana nova", () => {
    render(<AgendaView bookings={[]} initialDate="2026-09-20" initialStatus="completed" />);

    fireEvent.click(screen.getByRole("button", { name: "Próxima semana" }));
    expect(push).toHaveBeenLastCalledWith("/dashboard/agenda?data=2026-09-27&status=completed");

    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    expect(push).toHaveBeenLastCalledWith("/dashboard/agenda?data=2026-09-13&status=completed");
  });

  it("uma data de outra semana também busca no servidor", () => {
    render(<AgendaView bookings={[]} initialDate="2026-09-20" />);

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-15" } });
    expect(push).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-01" } });
    expect(push).toHaveBeenCalledWith("/dashboard/agenda?data=2026-10-01");
  });
});

describe("AgendaView filtros", () => {
  it("diz que nada bate com o filtro quando há reservas fora dele", () => {
    render(<AgendaView bookings={[booking({ id: "a" })]} initialDate="2026-09-20" initialStatus="completed" />);

    expect(screen.getByText(/Nenhuma reserva com esse filtro/)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma reserva ainda/)).not.toBeInTheDocument();
  });

  it("mostra os primeiros passos para quem ainda não tem reservas", () => {
    render(<AgendaView bookings={[]} hasAnyBooking={false} />);

    expect(screen.getByText(/Nenhuma reserva ainda/)).toBeInTheDocument();
  });

  it("começa com os filtros vindos da URL e os mantém na URL", () => {
    render(<AgendaView bookings={[sunday, saturday]} initialDate="2026-09-20" initialStatus="confirmed" />);

    expect(screen.getByText(/Joana/)).toBeInTheDocument();
    expect(window.location.search).toBe("?data=2026-09-20&status=confirmed");
  });

  it("abre no dia de hoje e informa o atalho ativo", () => {
    render(<AgendaView bookings={[]} />);

    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AgendaView acessibilidade", () => {
  it("dá nome ao filtro de status", () => {
    render(<AgendaView bookings={[]} />);

    expect(screen.getByRole("combobox", { name: "Filtrar por status" })).toBeInTheDocument();
  });
});

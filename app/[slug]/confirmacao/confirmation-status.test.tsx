import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationStatus } from "./confirmation-status";

vi.mock("./private-cancellation", () => ({
  PrivateCancellation: ({ canCancel, onCancelled }: { canCancel: boolean; onCancelled: () => void }) =>
    canCancel ? (
      <button type="button" onClick={onCancelled}>
        simular cancelamento
      </button>
    ) : null,
}));

describe("ConfirmationStatus", () => {
  it("switches to the cancelled state after a self-service cancellation", () => {
    document.title = "Reserva confirmada — AgendFined";
    render(
      <ConfirmationStatus code="65925DBB" initialStatus="confirmed">
        <p>detalhes</p>
      </ConfirmationStatus>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reserva confirmada!");

    fireEvent.click(screen.getByRole("button", { name: "simular cancelamento" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reserva cancelada");
    expect(screen.queryByText("Reserva confirmada!")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "simular cancelamento" })).not.toBeInTheDocument();
    expect(document.title).toBe("Reserva cancelada — AgendFined");
    expect(screen.queryByText("Guarde o código da sua reserva")).not.toBeInTheDocument();
    expect(screen.getByText("Código da reserva")).toBeInTheDocument();
  });

  // #141: cancelling after the start would erase a no-show.
  it("does not offer cancellation for a confirmed booking that already started", () => {
    render(
      <ConfirmationStatus code="65925DBB" initialStatus="confirmed" started>
        <p>detalhes</p>
      </ConfirmationStatus>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Este horário já passou");
    expect(screen.getByText(/fale com o negócio/i)).toBeInTheDocument();
    expect(screen.queryByText("Reserva confirmada!")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "simular cancelamento" })).not.toBeInTheDocument();
    expect(screen.getByText("Código da reserva")).toBeInTheDocument();
  });

  // #196: o cliente salva a reserva na própria agenda.
  const calendar = {
    icsHref: "/barbearia/confirmacao/evento.ics?code=65925DBB",
    googleHref: "https://calendar.google.com/calendar/render?action=TEMPLATE",
  };

  it("offers to add a confirmed reserva to the cliente's calendar until it is cancelled", () => {
    render(
      <ConfirmationStatus code="65925DBB" initialStatus="confirmed" calendar={calendar}>
        <p>detalhes</p>
      </ConfirmationStatus>,
    );
    const ics = screen.getByRole("link", { name: "Adicionar à minha agenda" });
    expect(ics).toHaveAttribute("href", calendar.icsHref);
    // A download attribute would make iOS Safari save the file instead of opening Calendar.
    expect(ics).not.toHaveAttribute("download");
    const google = screen.getByRole("link", { name: /Google Agenda/ });
    expect(google).toHaveAttribute("href", calendar.googleHref);
    expect(google).toHaveAttribute("target", "_blank");

    fireEvent.click(screen.getByRole("button", { name: "simular cancelamento" }));

    expect(screen.queryByRole("link", { name: "Adicionar à minha agenda" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Google Agenda/ })).not.toBeInTheDocument();
  });

  it.each([
    ["a reserva that already started", "confirmed", true],
    ["a cancelled reserva", "cancelled", false],
  ] as const)("does not offer the calendar for %s", (_case, status, started) => {
    render(
      <ConfirmationStatus code="65925DBB" initialStatus={status} started={started} calendar={calendar}>
        <p>detalhes</p>
      </ConfirmationStatus>,
    );
    expect(screen.queryByRole("link", { name: "Adicionar à minha agenda" })).not.toBeInTheDocument();
  });

  it("does not offer cancellation for a booking that is no longer confirmed", () => {
    render(
      <ConfirmationStatus code="65925DBB" initialStatus="cancelled">
        <p>detalhes</p>
      </ConfirmationStatus>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reserva cancelada");
    expect(screen.queryByRole("button", { name: "simular cancelamento" })).not.toBeInTheDocument();
  });
});

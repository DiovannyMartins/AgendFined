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

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicBookingStatus } from "./public-booking-status";
import { publicDocumentTitle } from "@/lib/bookings/public-status";

describe("PublicBookingStatus", () => {
  it("presents a confirmed booking as a guaranteed slot", () => {
    render(<PublicBookingStatus status="confirmed" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reserva confirmada!");
    expect(screen.getByText(/horário garantido/)).toBeInTheDocument();
  });

  it("warns that a cancelled booking freed its slot and never calls it confirmed", () => {
    render(<PublicBookingStatus status="cancelled" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reserva cancelada");
    expect(screen.getByText(/horário foi liberado/)).toBeInTheDocument();
    expect(screen.queryByText(/confirmada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/garantido/i)).not.toBeInTheDocument();
  });

  it("presents a completed booking as already attended", () => {
    render(<PublicBookingStatus status="completed" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reserva concluída");
    expect(screen.queryByText(/garantido/i)).not.toBeInTheDocument();
  });

  it("presents a no-show booking as missed", () => {
    render(<PublicBookingStatus status="no_show" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Não comparecimento registrado");
    expect(screen.queryByText(/garantido/i)).not.toBeInTheDocument();
  });
});

describe("publicDocumentTitle", () => {
  it("follows the booking status", () => {
    expect(publicDocumentTitle("confirmed")).toBe("Reserva confirmada — AgendFined");
    expect(publicDocumentTitle("cancelled")).toBe("Reserva cancelada — AgendFined");
    expect(publicDocumentTitle("completed")).toBe("Reserva concluída — AgendFined");
    expect(publicDocumentTitle("no_show")).toBe("Não comparecimento registrado — AgendFined");
  });
});

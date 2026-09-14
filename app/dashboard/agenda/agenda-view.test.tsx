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
        availability={[]}
        slotIntervalMinutes={30}
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
        availability={[]}
        slotIntervalMinutes={30}
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
        availability={[]}
        slotIntervalMinutes={30}
      />,
    );

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-20" } });
    expect(screen.queryByText(/Pedro/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Todas as datas/ }));

    expect(screen.getByText(/Joana/)).toBeInTheDocument();
    expect(screen.getByText(/Pedro/)).toBeInTheDocument();
  });
});

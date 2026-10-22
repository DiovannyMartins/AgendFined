import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateBookingStatus } = vi.hoisted(() => ({
  updateBookingStatus: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/bookings/actions", () => ({ updateBookingStatus }));

import { StatusAction } from "./status-action";

const START_AT = "2026-10-19T15:00:00.000Z";

describe("StatusAction", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    updateBookingStatus.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables Concluir and No-show before the reserva starts, but keeps Cancelar available", () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));

    render(<StatusAction id="booking-1" status="confirmed" startAt={START_AT} />);

    expect(screen.getByRole("button", { name: "Concluir" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No-show" })).toBeDisabled();
    expect(screen.getAllByTitle("Disponível após o início")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });

  it("asks for confirmation before marking a started reserva as concluída", async () => {
    vi.setSystemTime(new Date(START_AT));
    render(<StatusAction id="booking-1" status="confirmed" startAt={START_AT} />);

    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(updateBookingStatus).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Confirmar conclusão" }));

    await waitFor(() => expect(updateBookingStatus).toHaveBeenCalledTimes(1));
    const formData = (updateBookingStatus.mock.calls[0] as unknown[])[1] as FormData;
    expect(formData.get("id")).toBe("booking-1");
    expect(formData.get("status")).toBe("completed");
  });

  it("does nothing when the No-show confirmation is dismissed", async () => {
    vi.setSystemTime(new Date("2026-10-19T15:10:00.000Z"));
    render(<StatusAction id="booking-1" status="confirmed" startAt={START_AT} />);

    fireEvent.click(screen.getByRole("button", { name: "No-show" }));
    fireEvent.click(await screen.findByRole("button", { name: "Voltar" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirmar no-show" })).not.toBeInTheDocument());
    expect(updateBookingStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["no_show", "Marcar como concluída", "completed"],
    ["completed", "Marcar como no-show", "no_show"],
  ])("lets the owner correct a %s reserva after confirming (#145)", async (status, confirmLabel, nextStatus) => {
    vi.setSystemTime(new Date("2026-10-19T15:30:00.000Z"));
    render(<StatusAction id="booking-1" status={status} startAt={START_AT} />);

    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Corrigir status" }));
    expect(updateBookingStatus).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: confirmLabel }));

    await waitFor(() => expect(updateBookingStatus).toHaveBeenCalledTimes(1));
    const formData = (updateBookingStatus.mock.calls[0] as unknown[])[1] as FormData;
    expect(formData.get("id")).toBe("booking-1");
    expect(formData.get("status")).toBe(nextStatus);
  });

  it("offers no action on a cancelled reserva", () => {
    vi.setSystemTime(new Date("2026-10-19T15:30:00.000Z"));
    const { container } = render(<StatusAction id="booking-1" status="cancelled" startAt={START_AT} />);

    expect(container).toBeEmptyDOMElement();
  });
});

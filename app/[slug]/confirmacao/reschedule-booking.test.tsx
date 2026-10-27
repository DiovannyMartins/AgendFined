import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, getPublicRescheduleSlots, reschedulePublicBooking } = vi.hoisted(() => ({
  refresh: vi.fn(),
  getPublicRescheduleSlots: vi.fn(),
  reschedulePublicBooking: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/booking/reschedule", () => ({ getPublicRescheduleSlots, reschedulePublicBooking }));

import { RescheduleBooking } from "./reschedule-booking";

const TOKEN = "A".repeat(43);

function renderDialog() {
  render(
    <RescheduleBooking
      code="65925DBB"
      token={TOKEN}
      timezone="America/Sao_Paulo"
      currentStartAt="2026-10-26T13:00:00.000Z"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remarcar reserva" }));
}

describe("RescheduleBooking (#194)", () => {
  // The reserva is on a fixed day; frozen before it, so the day stays in the
  // future the dialog offers whatever the date the suite runs on.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getPublicRescheduleSlots.mockResolvedValue({ available: ["14:00", "15:00"] });
  });

  it("loads the free horários of the reserva's day and confirms the chosen one", async () => {
    reschedulePublicBooking.mockResolvedValue({ status: "done", startAt: "2026-10-26T18:00:00.000Z" });
    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "15:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar novo horário" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Reserva remarcada!");
    expect(screen.getByRole("status")).toHaveTextContent("26/10/2026 às 15:00");
    expect(getPublicRescheduleSlots).toHaveBeenCalledWith("65925DBB", TOKEN, "2026-10-26");
    const formData = reschedulePublicBooking.mock.calls[0][1] as FormData;
    expect(formData.get("token")).toBe(TOKEN);
    expect(formData.get("date")).toBe("2026-10-26");
    expect(formData.get("startTime")).toBe("15:00");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the dialog open with the reason when the horário was taken", async () => {
    reschedulePublicBooking.mockResolvedValue({
      status: "error",
      code: "SLOT_TAKEN",
      message: "Esse horário não está mais disponível. Escolha outro.",
    });
    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "14:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar novo horário" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não está mais disponível");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("only confirms once a horário is chosen", async () => {
    renderDialog();

    await screen.findByRole("button", { name: "14:00" });
    expect(screen.getByRole("button", { name: "Confirmar novo horário" })).toBeDisabled();
  });
});

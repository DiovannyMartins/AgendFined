import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingWidget } from "./booking-widget";
import { createBooking } from "@/lib/booking/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/turnstile-widget", () => ({ TurnstileWidget: () => null }));
vi.mock("@/lib/booking/actions", () => ({ createBooking: vi.fn(), joinWaitlist: vi.fn() }));
vi.mock("@/lib/availability/actions", () => ({
  getSlotsForDate: vi.fn().mockResolvedValue({ available: ["09:00", "09:30"] }),
}));

const mockedCreateBooking = vi.mocked(createBooking);

const services = [
  { id: "svc-1", name: "Corte", description: null, durationMinutes: 30, priceCents: 5000 },
];

async function fillAndSubmit(customerName: string) {
  render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} />);
  fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-20" } });
  fireEvent.click(await screen.findByRole("button", { name: "09:00" }));
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: customerName } });
  fireEvent.change(screen.getByLabelText("Telefone / WhatsApp"), { target: { value: "11987654321" } });
  fireEvent.change(screen.getByLabelText("E-mail para confirmação"), { target: { value: "maria@example.com" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
}

describe("BookingWidget", () => {
  beforeEach(() => {
    mockedCreateBooking.mockReset();
  });

  it("shows the server's field error next to the name and keeps the chosen slot", async () => {
    mockedCreateBooking.mockResolvedValue({
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: { customerName: ["Informe seu nome completo."] },
    });

    await fillAndSubmit("A");

    const nameInput = screen.getByLabelText("Nome");
    await waitFor(() => expect(nameInput).toHaveAttribute("aria-invalid", "true"));
    expect(nameInput).toHaveAccessibleDescription("Informe seu nome completo.");
    expect(screen.getByLabelText("Telefone / WhatsApp")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "09:00" })).toHaveAttribute("aria-pressed", "true");
  });

  it("drops the chosen slot when the server says it no longer exists", async () => {
    mockedCreateBooking.mockResolvedValue({
      ok: false,
      code: "booking_window",
      message: "A data está fora da janela de reservas de 60 dias deste negócio.",
    });

    await fillAndSubmit("Maria Souza");

    await screen.findByText(/fora da janela de reservas/);
    expect(screen.getByRole("button", { name: "09:00" })).toHaveAttribute("aria-pressed", "false");
  });
});

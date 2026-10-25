import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOwnerBooking, getOwnerSlots } from "@/lib/bookings/owner-booking";
import { NewBookingForm } from "./new-booking-form";

vi.mock("@/lib/bookings/owner-booking", () => ({
  createOwnerBooking: vi.fn(),
  getOwnerSlots: vi.fn(),
}));

const mockedCreate = vi.mocked(createOwnerBooking);
const mockedSlots = vi.mocked(getOwnerSlots);

const SERVICE = { id: "7f9c2a52-5f43-4d8e-9a3c-1b2d3e4f5a6b", name: "Corte", duration_minutes: 30, price_cents: 4000 };

function renderForm(services = [SERVICE]) {
  return render(<NewBookingForm services={services} timezone="America/Sao_Paulo" today="2026-10-24" />);
}

function fillCustomer() {
  fireEvent.change(screen.getByLabelText("Nome do cliente"), { target: { value: "Bruna Lima" } });
  fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "(11) 98888-7777" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSlots.mockResolvedValue({ available: ["10:00", "10:30"] });
});

describe("nova reserva pelo painel (#193)", () => {
  it("pede um serviço antes de tudo", () => {
    renderForm([]);

    expect(screen.getByText(/Cadastre um serviço ativo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para Serviços" })).toHaveAttribute("href", "/dashboard/servicos");
  });

  it("preenche o horário com um horário livre do dia", async () => {
    renderForm();

    fireEvent.click(await screen.findByRole("button", { name: "10:30" }));

    expect(mockedSlots).toHaveBeenCalledWith(SERVICE.id, "2026-10-24");
    expect(screen.getByLabelText("Horário")).toHaveValue("10:30");
  });

  it("mostra o encaixe só depois que o horário cai fora da disponibilidade", async () => {
    mockedCreate.mockResolvedValueOnce({
      ok: false,
      code: "outside_availability",
      message: "Esse horário fica fora da sua disponibilidade.",
    });
    renderForm();
    expect(screen.queryByLabelText(/Encaixe/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "19:00" } });
    fillCustomer();
    fireEvent.click(screen.getByRole("button", { name: "Criar reserva" }));

    expect(await screen.findByText("Esse horário fica fora da sua disponibilidade.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Encaixe/ })).not.toBeChecked();
    // The typed customer is kept for the second try (#148).
    expect(screen.getByLabelText("Nome do cliente")).toHaveValue("Bruna Lima");
  });

  it("mostra o código e o link para mandar pelo WhatsApp depois de criar", async () => {
    mockedCreate.mockResolvedValueOnce({
      ok: true,
      publicCode: "AB12CD34",
      confirmationUrl: "https://agendfined.test/barbearia/confirmacao?code=AB12CD34#cancel=token",
      agendaDate: "2026-10-26",
      customerName: "Bruna Lima",
      customerPhone: "11988887777",
      message: "Sem e-mail do cliente. Envie o link da confirmação pelo WhatsApp.",
    });
    renderForm();

    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "10:00" } });
    fillCustomer();
    fireEvent.click(screen.getByRole("button", { name: "Criar reserva" }));

    expect(await screen.findByText("Reserva criada: AB12-CD34")).toBeInTheDocument();
    const formData = mockedCreate.mock.calls[0][1];
    expect(formData.get("serviceId")).toBe(SERVICE.id);
    expect(formData.get("customerPhone")).toBe("(11) 98888-7777");

    const whatsapp = screen.getByRole("link", { name: "Enviar pelo WhatsApp" });
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain("#cancel=token");
    expect(screen.getByRole("link", { name: "Ver na agenda" })).toHaveAttribute("href", "/dashboard/agenda?data=2026-10-26");

    fireEvent.click(screen.getByRole("button", { name: "Criar outra reserva" }));
    expect(screen.getByLabelText("Nome do cliente")).toHaveValue("");
  });
});

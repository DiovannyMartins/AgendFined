import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingWidget } from "./booking-widget";
import { createBooking, joinWaitlist } from "@/lib/booking/actions";
import { getSlotsForDate } from "@/lib/availability/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/turnstile-widget", () => ({ TurnstileWidget: () => null }));
vi.mock("@/lib/booking/actions", () => ({ createBooking: vi.fn(), joinWaitlist: vi.fn() }));
vi.mock("@/lib/availability/actions", () => ({
  getSlotsForDate: vi.fn().mockResolvedValue({ available: ["09:00", "09:30"] }),
}));

const mockedCreateBooking = vi.mocked(createBooking);
const mockedJoinWaitlist = vi.mocked(joinWaitlist);
const mockedGetSlotsForDate = vi.mocked(getSlotsForDate);

const services = [
  { id: "svc-1", name: "Corte", description: null, durationMinutes: 30, priceCents: 5000 },
];

async function fillAndSubmit(customerName: string, offersWaitlist = true) {
  render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist={offersWaitlist} />);
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
    // The date picker's min is "today": freeze it so 2026-10-20 stays a bookable future date.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-18T12:00:00Z") });
    mockedCreateBooking.mockReset();
    mockedJoinWaitlist.mockReset();
    mockedGetSlotsForDate.mockReset().mockResolvedValue({ available: ["09:00", "09:30"] });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("limits the date picker to the janela futura", () => {
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" bookingWindowDays={60} services={services} offersWaitlist />);

    const date = screen.getByLabelText("Escolha a data");
    expect(date).toHaveAttribute("min", "2026-10-18");
    expect(date).toHaveAttribute("max", "2026-12-17");
  });

  it("shows the selected slot as a pt-BR date", async () => {
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);
    fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-20" } });
    fireEvent.click(await screen.findByRole("button", { name: "09:00" }));

    expect(screen.getByText("Horário selecionado: terça-feira, 20/10/2026 às 09:00 (Corte)")).toBeInTheDocument();
  });

  it("asks consent for the e-mail as a required field", () => {
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);

    const consent = screen.getByRole("checkbox", { name: /Autorizo o tratamento/ });
    expect(consent).toHaveAccessibleName(expect.stringContaining("(nome, telefone e e-mail)"));
    expect(consent).not.toHaveAccessibleName(expect.stringContaining("se informado"));
  });

  it("associates the consent text to the checkbox explicitly", () => {
    const { container } = render(
      <BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />,
    );

    const consent = screen.getByRole("checkbox", { name: /Autorizo o tratamento/ });
    expect(consent.id).not.toBe("");
    expect(container.querySelector(`label[for="${consent.id}"]`)).toHaveTextContent(/Autorizo o tratamento/);
  });

  it("says once, in a live region, that the date has no slots", async () => {
    mockedGetSlotsForDate.mockResolvedValue({ available: [] });
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);
    fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-20" } });

    const messages = await screen.findAllByText(/Nenhum horário disponível nesta data/);
    expect(messages).toHaveLength(1);
    expect(messages[0].closest("[aria-live]")).not.toBeNull();
  });

  it("explains an invalid date instead of blaming the business", async () => {
    mockedGetSlotsForDate.mockResolvedValue({ available: [], error: "validation" });
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);
    fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-20" } });

    expect(await screen.findByText("Não foi possível consultar esta data. Confira a data escolhida e tente novamente.")).toBeInTheDocument();
    expect(screen.queryByText(/encontrar este serviço ou negócio/)).not.toBeInTheDocument();
  });

  it("asks the browser for a phone keyboard and contact autofill", () => {
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);

    const phone = screen.getByLabelText("Telefone / WhatsApp");
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toHaveAttribute("inputmode", "tel");
    expect(phone).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("Nome")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("E-mail para confirmação")).toHaveAttribute("autocomplete", "email");
  });

  it("shows the waitlist's field error next to the phone", async () => {
    mockedCreateBooking.mockResolvedValue({
      ok: false,
      code: "slot_taken",
      message: "Esse horário acabou de ser reservado. Escolha outro.",
    });
    mockedJoinWaitlist.mockResolvedValue({
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: { customerPhone: ["Informe um telefone com DDD."] },
    });

    await fillAndSubmit("Maria Souza");
    fireEvent.click(await screen.findByRole("button", { name: "Entrar na lista de espera" }));

    const phone = screen.getByLabelText("Telefone / WhatsApp");
    await waitFor(() => expect(phone).toHaveAttribute("aria-invalid", "true"));
    expect(phone).toHaveAccessibleDescription("Informe um telefone com DDD.");
  });

  it("without a waitlist, a taken slot only asks for another one and reloads the slots", async () => {
    mockedCreateBooking.mockResolvedValue({
      ok: false,
      code: "slot_taken",
      message: "Esse horário não está mais disponível. Escolha outro.",
    });
    mockedGetSlotsForDate.mockResolvedValueOnce({ available: ["09:00", "09:30"] });
    mockedGetSlotsForDate.mockResolvedValueOnce({ available: ["09:30"] });

    await fillAndSubmit("Maria Souza", false);

    expect(await screen.findByRole("alert")).toHaveTextContent("Esse horário acabou de ser reservado. Escolha outro.");
    await waitFor(() => expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "09:30" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Entrar na lista de espera" })).not.toBeInTheDocument();
    expect(screen.queryByText(/lista de espera/i)).not.toBeInTheDocument();
  });

  it("with a waitlist, a taken slot leaves the slot list but stays on offer for the waitlist", async () => {
    mockedCreateBooking.mockResolvedValue({
      ok: false,
      code: "slot_taken",
      message: "Esse horário acabou de ser reservado.",
    });
    mockedJoinWaitlist.mockResolvedValue({ ok: true, message: "Você entrou na lista de espera deste horário." });
    mockedGetSlotsForDate.mockResolvedValueOnce({ available: ["09:00", "09:30"] });
    mockedGetSlotsForDate.mockResolvedValueOnce({ available: ["09:30"] });

    await fillAndSubmit("Maria Souza");

    await waitFor(() => expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "09:30" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("O horário de terça-feira, 20/10/2026 às 09:00 acabou de ser reservado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista de espera" }));

    await waitFor(() =>
      expect(mockedJoinWaitlist).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-20", startTime: "09:00" })),
    );
  });

  it("unlocks the button and explains the failure when the reserva action throws", async () => {
    mockedCreateBooking.mockRejectedValue(new Error("network"));

    await fillAndSubmit("Maria Souza");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível concluir. Verifique sua conexão e tente novamente.",
    );
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
    expect(screen.queryByText("Confirmando...")).not.toBeInTheDocument();
  });

  it("unlocks the waitlist button and explains the failure when the action throws", async () => {
    mockedCreateBooking.mockResolvedValue({ ok: false, code: "slot_taken", message: "Esse horário acabou de ser reservado." });
    mockedJoinWaitlist.mockRejectedValue(new Error("network"));

    await fillAndSubmit("Maria Souza");
    fireEvent.click(await screen.findByRole("button", { name: "Entrar na lista de espera" }));

    expect(await screen.findByText("Não foi possível concluir. Verifique sua conexão e tente novamente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar na lista de espera" })).toBeEnabled();
  });

  it("says the serviço is no longer available when it was turned off with the page open", async () => {
    mockedGetSlotsForDate.mockResolvedValue({ available: [], error: "service_not_found" });
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);
    fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-20" } });

    expect(await screen.findByText("Este serviço não está mais disponível. Escolha outro.")).toBeInTheDocument();
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

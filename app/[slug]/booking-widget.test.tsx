import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingWidget } from "./booking-widget";
import { createBooking, joinWaitlist } from "@/lib/booking/actions";
import { fetchSlots } from "@/lib/availability/slots-client";
import { readConfirmationEmailStatus } from "@/lib/bookings/private-confirmation";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/turnstile-widget", () => ({ TurnstileWidget: () => null }));
vi.mock("@/lib/booking/actions", () => ({ createBooking: vi.fn(), joinWaitlist: vi.fn() }));
vi.mock("@/lib/availability/slots-client", () => ({
  fetchSlots: vi.fn().mockResolvedValue({ available: ["09:00", "09:30"] }),
}));

const mockedCreateBooking = vi.mocked(createBooking);
const mockedJoinWaitlist = vi.mocked(joinWaitlist);
const mockedFetchSlots = vi.mocked(fetchSlots);

const services = [
  { id: "svc-1", name: "Corte", description: null, durationMinutes: 30, priceCents: 5000 },
];

async function fillAndSubmit(customerName: string, offersWaitlist = true) {
  render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist={offersWaitlist} />);
  fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-20" } });
  fireEvent.click(await screen.findByRole("button", { name: "09:00" }));
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: customerName } });
  fireEvent.change(screen.getByLabelText("Telefone / WhatsApp"), { target: { value: "11987654321" } });
  fireEvent.change(screen.getByLabelText("E-mail (opcional)"), { target: { value: "maria@example.com" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
}

describe("BookingWidget", () => {
  beforeEach(() => {
    // The date picker's min is "today": freeze it so 2026-10-20 stays a bookable future date.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-18T12:00:00Z") });
    mockedCreateBooking.mockReset();
    mockedJoinWaitlist.mockReset();
    mockedFetchSlots.mockReset().mockResolvedValue({ available: ["09:00", "09:30"] });
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

  // #187/#195: the confirmation page only learns what happened to the e-mail
  // from this navigation.
  it.each(["sent", "failed", "none"] as const)(
    "goes to the private confirmation saying what happened to the e-mail (%s)",
    async (confirmationEmail) => {
      push.mockClear();
      mockedCreateBooking.mockResolvedValue({
        ok: true,
        publicCode: "65925DBB",
        cancelToken: "A".repeat(43),
        confirmationEmail,
      });

      await fillAndSubmit("Maria Souza");

      await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
      const url = new URL(push.mock.calls[0][0], "https://agenda.example");
      expect(url.pathname).toBe("/barbearia/confirmacao");
      expect(readConfirmationEmailStatus(url.hash)).toBe(confirmationEmail);
    },
  );

  // GHSA-3h6j: GA goes off only after booking_complete is dispatched and before
  // the capability URL reaches history.
  it("sends booking_complete, then turns GA off, then goes to the confirmation", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST000000");
    const analyticsWindow = window as unknown as Record<string, unknown>;
    analyticsWindow["ga-disable-G-TEST000000"] = false;
    const gtag = vi.fn();
    window.gtag = gtag;
    push.mockClear();
    mockedCreateBooking.mockResolvedValue({
      ok: true,
      publicCode: "65925DBB",
      cancelToken: "A".repeat(43),
      confirmationEmail: "sent",
    });

    try {
      await fillAndSubmit("Maria Souza");
      await waitFor(() => expect(gtag).toHaveBeenCalledWith("event", "booking_complete", expect.anything()));
      expect(push).not.toHaveBeenCalled();
      expect(analyticsWindow["ga-disable-G-TEST000000"]).toBe(false);

      push.mockImplementation(() => {
        expect(analyticsWindow["ga-disable-G-TEST000000"]).toBe(true);
      });
      gtag.mock.calls[0][2].event_callback();
      expect(push).toHaveBeenCalledTimes(1);
    } finally {
      push.mockReset();
      delete window.gtag;
      delete analyticsWindow["ga-disable-G-TEST000000"];
      vi.unstubAllEnvs();
    }
  });

  // #195: o e-mail é opcional; o formulário não trava sem ele.
  it("lets the cliente book without an e-mail", () => {
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);

    const email = screen.getByLabelText("E-mail (opcional)");
    expect(email).not.toBeRequired();
    expect(email).toHaveAccessibleDescription(expect.stringContaining("Sem e-mail, guarde o link"));
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

  it("asks consent for the e-mail only when the cliente gives one", () => {
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);

    const consent = screen.getByRole("checkbox", { name: /Autorizo o tratamento/ });
    expect(consent).toHaveAccessibleName(expect.stringContaining("(nome, telefone e e-mail, se informado)"));
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
    mockedFetchSlots.mockResolvedValue({ available: [] });
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);
    fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-20" } });

    const messages = await screen.findAllByText(/Nenhum horário disponível nesta data/);
    expect(messages).toHaveLength(1);
    expect(messages[0].closest("[aria-live]")).not.toBeNull();
  });

  it("explains an invalid date instead of blaming the business", async () => {
    mockedFetchSlots.mockResolvedValue({ available: [], error: "validation" });
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
    expect(screen.getByLabelText("E-mail (opcional)")).toHaveAttribute("autocomplete", "email");
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
    mockedFetchSlots.mockResolvedValueOnce({ available: ["09:00", "09:30"] });
    mockedFetchSlots.mockResolvedValueOnce({ available: ["09:30"] });

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
    mockedFetchSlots.mockResolvedValueOnce({ available: ["09:00", "09:30"] });
    mockedFetchSlots.mockResolvedValueOnce({ available: ["09:30"] });

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
    mockedFetchSlots.mockResolvedValue({ available: [], error: "service_not_found" });
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

describe("BookingWidget — consulta de horários", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-18T12:00:00Z") });
    mockedFetchSlots.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // #216: trocar a data rapidamente cancela a consulta anterior, e só a última responde.
  it("cancela a consulta anterior quando a data muda e mostra só a resposta da última", async () => {
    const pending: Array<{ signal?: AbortSignal; resolve: (r: { available: string[] }) => void }> = [];
    mockedFetchSlots.mockImplementation(
      (_b, _s, _d, signal) => new Promise((resolve) => pending.push({ signal, resolve })),
    );
    render(<BookingWidget businessId="biz-1" slug="barbearia" timezone="America/Sao_Paulo" services={services} offersWaitlist />);

    fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-20" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Escolha a data"), { target: { value: "2026-10-21" } });
    await waitFor(() => expect(pending).toHaveLength(2));

    expect(mockedFetchSlots.mock.calls.map((call) => call[2])).toEqual(["2026-10-20", "2026-10-21"]);
    expect(pending[0].signal?.aborted).toBe(true);
    expect(pending[1].signal?.aborted).toBe(false);

    pending[1].resolve({ available: ["10:00"] });
    pending[0].resolve({ available: ["09:00"] });

    expect(await screen.findByRole("button", { name: "10:00" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument();
  });
});

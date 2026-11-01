import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgendaBooking } from "@/lib/agenda/view";
import { AgendaList } from "./agenda-list";

vi.mock("./status-action", () => ({ StatusAction: () => null }));

function booking(overrides: Partial<AgendaBooking> = {}): AgendaBooking {
  return {
    id: "b1",
    start_at: "2026-10-20T13:00:00.000Z",
    has_email: false,
    status: "confirmed",
    service_name_snapshot: "Manicure",
    duration_minutes_snapshot: 60,
    customer_name_snapshot: "Ana",
    customer_phone_snapshot: "11999990000",
    public_code: "ABC123",
    ...overrides,
  };
}

describe("AgendaList", () => {
  it("dá à busca um nome acessível que não depende do placeholder", () => {
    render(<AgendaList bookings={[]} timezone="America/Sao_Paulo" />);

    expect(screen.getByRole("searchbox", { name: "Buscar reservas" })).toBeInTheDocument();
  });

  it("mostra a observação do cliente na reserva", () => {
    render(
      <AgendaList
        bookings={[booking({ customer_note: "Sou alergica a acetona" })]}
        timezone="America/Sao_Paulo"
      />,
    );

    expect(screen.getByText("Sou alergica a acetona")).toBeInTheDocument();
  });

  it("exibe observação com HTML como texto, sem interpretar a marcação", () => {
    const note = '<script>alert("x")</script><b>negrito</b>';
    const { container } = render(
      <AgendaList bookings={[booking({ customer_note: note })]} timezone="America/Sao_Paulo" />,
    );

    expect(screen.getByText(note)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("quebra observações longas em vez de estourar o layout", () => {
    const note = "a".repeat(500);
    render(<AgendaList bookings={[booking({ customer_note: note })]} timezone="America/Sao_Paulo" />);

    expect(screen.getByText(note)).toHaveClass("break-words", "whitespace-pre-line");
  });

  it("não mostra bloco de observação quando ela está vazia", () => {
    render(<AgendaList bookings={[booking({ customer_note: "   " })]} timezone="America/Sao_Paulo" />);

    expect(screen.queryByText(/Observação:/)).not.toBeInTheDocument();
  });

  // #149: o aviso diz o que fazer e some quando a reserva já foi encerrada.
  it("pede para ler a observação antes de um atendimento confirmado", () => {
    render(
      <AgendaList
        bookings={[booking({ customer_note: "Gostaria de corte em camadas", customer_note_requires_follow_up: true })]}
        timezone="America/Sao_Paulo"
      />,
    );

    expect(screen.getByText("Leia a observação antes do atendimento.")).toBeInTheDocument();
    expect(screen.queryByText(/acompanhamento manual/)).not.toBeInTheDocument();
  });

  it.each(["cancelled", "completed", "no_show"] as const)("não mostra o aviso da observação numa reserva %s", (status) => {
    render(
      <AgendaList
        bookings={[booking({ status, customer_note: "Gostaria de corte em camadas", customer_note_requires_follow_up: true })]}
        timezone="America/Sao_Paulo"
      />,
    );

    expect(screen.queryByText("Leia a observação antes do atendimento.")).not.toBeInTheDocument();
  });
  // #149 item 16: a agenda diz quem cancelou.
  it.each([
    ["customer", "Cancelada pelo cliente"],
    ["business", "Cancelada por você"],
    [null, "Cancelada"],
  ])("mostra quem cancelou (%s)", (cancelledBy, label) => {
    render(<AgendaList bookings={[booking({ status: "cancelled", cancelled_by: cancelledBy })]} timezone="America/Sao_Paulo" />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  // #195: o dono lembra o cliente pelo próprio WhatsApp, antes do atendimento.
  describe("lembrete pelo WhatsApp", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T12:00:00Z") });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("abre a conversa com o cliente e o lembrete pronto numa reserva confirmada por vir", () => {
      render(<AgendaList bookings={[booking()]} timezone="America/Sao_Paulo" businessName="Barbearia Demo" />);

      const link = screen.getByRole("link", { name: "Lembrar pelo WhatsApp" });
      expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=/);
      expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain("Barbearia Demo");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it.each(["cancelled", "completed", "no_show"] as const)("não oferece lembrete numa reserva %s", (status) => {
      render(<AgendaList bookings={[booking({ status })]} timezone="America/Sao_Paulo" />);

      expect(screen.queryByRole("link", { name: "Lembrar pelo WhatsApp" })).not.toBeInTheDocument();
    });

    it("não oferece lembrete depois que o atendimento começou", () => {
      vi.setSystemTime(new Date("2026-10-20T13:30:00Z"));
      render(<AgendaList bookings={[booking()]} timezone="America/Sao_Paulo" />);

      expect(screen.queryByRole("link", { name: "Lembrar pelo WhatsApp" })).not.toBeInTheDocument();
    });

    it("avisa, com lembretes automáticos ligados, que o cliente sem e-mail não recebe o lembrete automático", () => {
      const { rerender } = render(
        <AgendaList bookings={[booking({ has_email: false })]} timezone="America/Sao_Paulo" automaticReminders />,
      );
      expect(screen.getByText("Sem e-mail: não recebe o lembrete automático.")).toBeInTheDocument();

      rerender(
        <AgendaList
          bookings={[booking({ has_email: true })]}
          timezone="America/Sao_Paulo"
          automaticReminders
        />,
      );
      expect(screen.queryByText(/não recebe o lembrete automático/)).not.toBeInTheDocument();

      // Sem lembretes automáticos (negócio suspenso) ninguém recebe, então o aviso não diz nada.
      rerender(<AgendaList bookings={[booking({ has_email: false })]} timezone="America/Sao_Paulo" />);
      expect(screen.queryByText(/não recebe o lembrete automático/)).not.toBeInTheDocument();
    });
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoogleCalendarSection } from "./google-calendar-section";

vi.mock("@/lib/google-calendar/actions", () => ({
  syncGoogleCalendarNow: vi.fn(async () => ({ ok: true })),
  disconnectGoogleCalendar: vi.fn(async () => ({ ok: true })),
  adoptGoogleCalendarTimezone: vi.fn(async () => ({ ok: true })),
}));

describe("GoogleCalendarSection callback notice", () => {
  it.each([
    ["connected", "status", "Google Calendar conectado"],
    ["cancelled", "status", "Você cancelou a conexão no Google"],
    ["invalid_state", "alert", "Não foi possível validar a conexão"],
    ["unauthorized", "alert", "Entre com a conta do negócio"],
    ["upgrade_required", "alert", "disponível no plano PROFISSIONAL"],
    ["not_configured", "alert", "ainda não está configurada"],
    ["missing_email", "alert", "não informou o e-mail"],
    ["missing_refresh_token", "alert", "não concedeu acesso contínuo"],
    ["connection_failed", "alert", "Não foi possível concluir a conexão"],
  ])("explains the %s result in Portuguese", (callbackStatus, role, text) => {
    render(<GoogleCalendarSection connection={null} isPro callbackStatus={callbackStatus} />);

    expect(screen.getByRole(role)).toHaveTextContent(text);
  });

  it("ignores an unknown result instead of echoing the query string", () => {
    render(<GoogleCalendarSection connection={null} isPro callbackStatus="<script>" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("GoogleCalendarSection connect link", () => {
  // #136: um <a type="button"> confunde o leitor de tela e dispara o aviso do Base UI.
  it("renders the connect action as a plain link", () => {
    render(<GoogleCalendarSection connection={null} isPro />);

    const link = screen.getByRole("link", { name: "Conectar Google Calendar" });
    expect(link).toHaveAttribute("href", "/api/google-calendar/connect");
    expect(link).not.toHaveAttribute("type");
  });
});

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

describe("GoogleCalendarSection sync failure", () => {
  const connection = {
    googleEmail: "dono@example.com",
    calendarId: "primary",
    calendarTimezone: "America/Sao_Paulo",
    businessTimezone: "America/Sao_Paulo",
    timezoneMismatch: false,
    lastSyncAt: null,
    lastError: "GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED",
    needsReconnect: false,
  };

  it("suggests syncing again after a passing failure", () => {
    render(<GoogleCalendarSection connection={connection} isPro />);

    expect(screen.getByText(/A última sincronização falhou/)).toBeInTheDocument();
  });

  // Sincronizar de novo nunca resolve uma autorização revogada.
  it("asks only to reconnect when Google no longer authorizes the calendar", () => {
    render(
      <GoogleCalendarSection
        connection={{ ...connection, lastError: "GOOGLE_CALENDAR_REAUTH_REQUIRED", needsReconnect: true }}
        isPro
      />,
    );

    expect(screen.getByText(/O Google não autoriza mais o acesso à sua agenda/)).toHaveTextContent(
      "Desconecte e conecte o Google Calendar de novo",
    );
    expect(screen.queryByText(/Tente sincronizar novamente/)).not.toBeInTheDocument();
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

// #189: the negócio's fuso can only be Brazilian, so the button never offers a
// fuso abroad.
describe("GoogleCalendarSection fuso mismatch", () => {
  const connection = {
    googleEmail: "dono@example.com",
    calendarId: "primary",
    calendarTimezone: "America/Fortaleza",
    businessTimezone: "America/Sao_Paulo",
    timezoneMismatch: true,
    lastSyncAt: null,
    lastError: null,
    needsReconnect: false,
  };

  it("offers to adopt a Brazilian Google Calendar fuso", () => {
    render(<GoogleCalendarSection connection={connection} isPro />);

    expect(screen.getByRole("button", { name: "Usar o fuso do Google Calendar" })).toBeInTheDocument();
  });

  it("explains instead of offering a Google Calendar fuso abroad", () => {
    render(<GoogleCalendarSection connection={{ ...connection, calendarTimezone: "Europe/Lisbon" }} isPro />);

    expect(screen.queryByRole("button", { name: "Usar o fuso do Google Calendar" })).not.toBeInTheDocument();
    expect(screen.getByText(/fora do Brasil/)).toHaveTextContent("ajuste o fuso no Google Calendar");
  });
});

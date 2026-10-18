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

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { login } from "@/lib/auth/actions";
import LoginPage from "./page";

vi.mock("@/lib/auth/actions", () => ({ login: vi.fn() }));
vi.mock("@/components/turnstile-widget", () => ({ TurnstileWidget: () => null }));

const mockedLogin = vi.mocked(login);

async function renderLogin(searchParams: { error?: string; next?: string | string[] } = {}) {
  render(await LoginPage({ searchParams: Promise.resolve(searchParams) }));
}

async function submittedNext() {
  mockedLogin.mockResolvedValueOnce({ ok: false, code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos." });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "dono@example.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Senha-forte-1" } });
  fireEvent.click(await screen.findByRole("button", { name: "Entrar" }));
  await screen.findByText("E-mail ou senha incorretos.");
  return (mockedLogin.mock.lastCall?.[1] as FormData).get("next");
}

describe("página de login", () => {
  it("avisa que o e-mail pode já estar confirmado quando o link de autenticação falha", async () => {
    await renderLogin({ error: "auth" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Não conseguimos concluir o acesso por este link. Seu e-mail pode já ter sido confirmado: entre com seu e-mail e senha para continuar.",
    );
  });

  it("não mostra aviso quando não há erro", async () => {
    await renderLogin();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("repassa ao login o destino de onde a sessão expirou", async () => {
    await renderLogin({ next: "/dashboard/agenda" });

    expect(await submittedNext()).toBe("/dashboard/agenda");
  });

  it("não repassa destinos externos", async () => {
    await renderLogin({ next: "//evil.com" });

    expect(await submittedNext()).toBeNull();
  });
});

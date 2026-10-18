import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("@/lib/auth/actions", () => ({ login: vi.fn() }));

async function renderLogin(searchParams: { error?: string } = {}) {
  render(await LoginPage({ searchParams: Promise.resolve(searchParams) }));
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
});

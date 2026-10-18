import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { login } from "@/lib/auth/actions";
import { LoginForm } from "./login-form";

vi.mock("@/lib/auth/actions", () => ({ login: vi.fn() }));
vi.mock("@/components/turnstile-widget", () => ({ TurnstileWidget: () => null }));

const mockedLogin = vi.mocked(login);

async function submit() {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "dono@example.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-errada" } });
  fireEvent.click(await screen.findByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  it("limpa o erro anterior quando uma nova tentativa começa", async () => {
    mockedLogin.mockResolvedValueOnce({ ok: false, code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos." });
    render(<LoginForm />);

    await submit();
    expect(await screen.findByText("E-mail ou senha incorretos.")).toBeInTheDocument();

    mockedLogin.mockReturnValueOnce(new Promise(() => {}));
    await submit();

    expect(await screen.findByRole("button", { name: "Entrando..." })).toBeInTheDocument();
    expect(screen.queryByText("E-mail ou senha incorretos.")).not.toBeInTheDocument();
  });
});

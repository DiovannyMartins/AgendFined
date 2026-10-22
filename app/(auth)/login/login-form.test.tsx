import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { login, resendSignupConfirmation } from "@/lib/auth/actions";
import { LoginForm } from "./login-form";

vi.mock("@/lib/auth/actions", () => ({ login: vi.fn(), resendSignupConfirmation: vi.fn() }));
vi.mock("@/components/turnstile-widget", () => ({ TurnstileWidget: () => null }));

const mockedLogin = vi.mocked(login);
const mockedResend = vi.mocked(resendSignupConfirmation);

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

  it("envia o destino recebido junto com o login", async () => {
    mockedLogin.mockResolvedValueOnce({ ok: false, code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos." });
    render(<LoginForm next="/dashboard/agenda" />);

    await submit();
    await screen.findByText("E-mail ou senha incorretos.");

    expect((mockedLogin.mock.lastCall?.[1] as FormData).get("next")).toBe("/dashboard/agenda");
  });

  it("não oferece reenvio de confirmação para senha incorreta", async () => {
    mockedLogin.mockResolvedValueOnce({ ok: false, code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos." });
    render(<LoginForm />);

    await submit();
    await screen.findByText("E-mail ou senha incorretos.");

    expect(screen.queryByRole("button", { name: "Reenviar confirmação" })).not.toBeInTheDocument();
  });

  // #139: conta com e-mail não confirmado não tinha como pedir um novo link.
  it("oferece reenviar a confirmação para o e-mail usado no login", async () => {
    mockedLogin.mockResolvedValueOnce({ ok: false, code: "EMAIL_NOT_CONFIRMED", message: "Confirme seu e-mail para entrar." });
    mockedResend.mockResolvedValueOnce({ ok: true, data: undefined });
    render(<LoginForm />);

    await submit();
    expect(await screen.findByText("Confirme seu e-mail para entrar.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reenviar confirmação" }));

    expect(await screen.findByText(/enviamos um novo link/)).toBeInTheDocument();
    expect((mockedResend.mock.lastCall?.[1] as FormData).get("email")).toBe("dono@example.com");
  });
});

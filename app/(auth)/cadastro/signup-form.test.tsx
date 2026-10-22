import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resendSignupConfirmation, signup } from "@/lib/auth/actions";
import { SignupForm } from "./signup-form";

vi.mock("@/lib/auth/actions", () => ({ signup: vi.fn(), resendSignupConfirmation: vi.fn() }));
vi.mock("@/components/turnstile-widget", () => ({ TurnstileWidget: () => null }));
vi.mock("@/lib/analytics", () => ({ trackAnalyticsEvent: vi.fn() }));

const mockedSignup = vi.mocked(signup);
const mockedResend = vi.mocked(resendSignupConfirmation);

async function createAccount() {
  fireEvent.change(screen.getByLabelText("Como quer ser chamado?"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Senha-forte-1" } });
  fireEvent.click(await screen.findByRole("button", { name: "Começar grátis" }));
  await screen.findByText("Conta criada com sucesso!");
}

// #139: com confirmações ligadas, um e-mail já cadastrado recebe o mesmo
// "sucesso" sem e-mail nenhum, e o e-mail de quem é novo pode atrasar.
describe("SignupForm depois do cadastro", () => {
  it("aponta login e recuperação de senha para quem já tinha conta", async () => {
    mockedSignup.mockResolvedValueOnce({ ok: true, data: undefined });
    render(<SignupForm />);

    await createAccount();

    expect(screen.getByRole("link", { name: "Entre" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "recupere a senha" })).toHaveAttribute("href", "/recuperar-senha");
  });

  it("reenvia a confirmação para o e-mail cadastrado", async () => {
    mockedSignup.mockResolvedValueOnce({ ok: true, data: undefined });
    mockedResend.mockResolvedValueOnce({ ok: true, data: undefined });
    render(<SignupForm />);

    await createAccount();
    fireEvent.click(screen.getByRole("button", { name: "Não recebeu o e-mail? Reenviar" }));

    expect(await screen.findByText(/enviamos um novo link/)).toBeInTheDocument();
    expect((mockedResend.mock.lastCall?.[1] as FormData).get("email")).toBe("ana@example.com");
  });

  it("mostra o limite de tentativas do reenvio", async () => {
    mockedSignup.mockResolvedValueOnce({ ok: true, data: undefined });
    mockedResend.mockResolvedValueOnce({
      ok: false,
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Tente novamente mais tarde.",
    });
    render(<SignupForm />);

    await createAccount();
    fireEvent.click(screen.getByRole("button", { name: "Não recebeu o e-mail? Reenviar" }));

    expect(await screen.findByText("Muitas tentativas. Tente novamente mais tarde.")).toBeInTheDocument();
  });
});

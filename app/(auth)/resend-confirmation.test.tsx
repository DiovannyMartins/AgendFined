import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resendSignupConfirmation } from "@/lib/auth/actions";
import { ResendConfirmation, RESEND_COOLDOWN_SECONDS } from "./resend-confirmation";

vi.mock("@/lib/auth/actions", () => ({ resendSignupConfirmation: vi.fn() }));

const captcha = { token: "", canSubmit: true, renew: vi.fn(), widget: <></> };

// #179: o Supabase recusa reenvios por ~60 s (max_frequency = "1m") e a
// resposta continua neutra, então o botão espera em vez de fingir que enviou.
describe("ResendConfirmation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(resendSignupConfirmation).mockReset();
    vi.mocked(resendSignupConfirmation).mockResolvedValue({ ok: true, data: undefined });
  });
  afterEach(() => vi.useRealTimers());

  it("waits a minute before allowing another resend", async () => {
    render(<ResendConfirmation email="dono@example.com" captcha={captcha} label="Reenviar confirmação" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reenviar confirmação" }));
    });

    expect(resendSignupConfirmation).toHaveBeenCalledOnce();
    expect(screen.getByText(/enviamos um novo link/)).toHaveTextContent(/Se não chegar em alguns minutos/);
    expect(screen.getByRole("button", { name: `Reenviar em ${RESEND_COOLDOWN_SECONDS} s` })).toBeDisabled();

    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: "Reenviar em 30 s" })).toBeDisabled();

    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: "Reenviar confirmação" })).toBeEnabled();
  });

  it("starts waiting right away when the signup has just sent the e-mail", () => {
    render(<ResendConfirmation email="dono@example.com" captcha={captcha} label="Reenviar" justSent />);

    expect(screen.getByRole("button", { name: `Reenviar em ${RESEND_COOLDOWN_SECONDS} s` })).toBeDisabled();

    act(() => vi.advanceTimersByTime(RESEND_COOLDOWN_SECONDS * 1000));
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeEnabled();
  });

  it("allows an immediate retry after a refused resend", async () => {
    vi.mocked(resendSignupConfirmation).mockResolvedValue({
      ok: false,
      code: "CAPTCHA_FAILED",
      message: "Verificação humana falhou. Tente novamente.",
    });
    render(<ResendConfirmation email="dono@example.com" captcha={captcha} label="Reenviar confirmação" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reenviar confirmação" }));
    });

    expect(screen.getByText("Verificação humana falhou. Tente novamente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar confirmação" })).toBeEnabled();
  });
});

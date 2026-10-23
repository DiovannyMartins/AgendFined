import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginTotpEnrollment, removeTotp, verifyTotp } from "@/lib/auth/actions";
import { MfaPanel } from "./mfa-panel";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth/actions", () => ({
  beginTotpEnrollment: vi.fn(),
  removeTotp: vi.fn(),
  verifyTotp: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MfaPanel (#149)", () => {
  it("diz que a autenticação foi ativada depois de confirmar o primeiro código", async () => {
    vi.mocked(beginTotpEnrollment).mockResolvedValue({
      ok: true,
      data: { factorId: "factor-1", qrCode: "data:image/svg+xml;base64,AA==", secret: "SECRET" },
    });
    vi.mocked(verifyTotp).mockResolvedValue({ ok: true, data: undefined });
    render(<MfaPanel factorId={null} verified={false} returnTo="/dashboard/configuracoes" />);

    fireEvent.click(screen.getByRole("button", { name: "Ativar autenticador" }));
    fireEvent.change(await screen.findByLabelText("Código de 6 dígitos"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Autenticação em duas etapas ativada.");
    expect(verifyTotp).toHaveBeenCalledWith("factor-1", "123456");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Continuar" })).toHaveAttribute("href", "/dashboard/configuracoes");
  });

  it("volta ao destino depois de responder o desafio do login", async () => {
    vi.mocked(verifyTotp).mockResolvedValue({ ok: true, data: undefined });
    render(<MfaPanel factorId="factor-1" verified={false} returnTo="/dashboard/agenda" />);

    fireEvent.change(screen.getByLabelText("Código de 6 dígitos"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/agenda"));
  });

  it("não diz que o autenticador está ativo depois de removido na mesma sessão", () => {
    render(<MfaPanel factorId={null} verified returnTo="/dashboard" />);

    expect(screen.queryByText(/está ativ/)).not.toBeInTheDocument();
    expect(screen.getByText("Proteja sua conta com um aplicativo autenticador.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ativar autenticador" })).toBeInTheDocument();
  });

  it("pede confirmação num diálogo antes de remover", async () => {
    vi.mocked(removeTotp).mockResolvedValue({ ok: true, data: undefined });
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<MfaPanel factorId="factor-1" verified returnTo="/dashboard" />);

    fireEvent.click(screen.getByRole("button", { name: "Remover autenticador" }));
    const dialog = await screen.findByRole("dialog");
    expect(removeTotp).not.toHaveBeenCalled();

    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "Remover autenticador")!,
    );

    await vi.waitFor(() => expect(removeTotp).toHaveBeenCalledWith("factor-1"));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

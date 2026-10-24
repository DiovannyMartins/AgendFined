import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginTotpEnrollment,
  generateMfaRecoveryCodes,
  redeemMfaRecoveryCode,
  removeTotp,
  verifyTotp,
} from "@/lib/auth/actions";
import { MfaPanel } from "./mfa-panel";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth/actions", () => ({
  beginTotpEnrollment: vi.fn(),
  generateMfaRecoveryCodes: vi.fn(),
  redeemMfaRecoveryCode: vi.fn(),
  removeTotp: vi.fn(),
  verifyTotp: vi.fn(),
}));

const CODES = Array.from({ length: 10 }, (_, index) => `AB12C-DE3${index}F`);

function enrollAndConfirm() {
  vi.mocked(beginTotpEnrollment).mockResolvedValue({
    ok: true,
    data: { factorId: "factor-1", qrCode: "data:image/svg+xml;base64,AA==", secret: "SECRET" },
  });
  vi.mocked(verifyTotp).mockResolvedValue({ ok: true, data: undefined });
  return async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ativar autenticador" }));
    fireEvent.change(await screen.findByLabelText("Código de 6 dígitos"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateMfaRecoveryCodes).mockResolvedValue({ ok: true, data: { codes: CODES } });
});

describe("MfaPanel (#149)", () => {
  it("diz que a autenticação foi ativada depois de confirmar o primeiro código", async () => {
    const confirm = enrollAndConfirm();
    render(<MfaPanel factorId={null} verified={false} returnTo="/dashboard/configuracoes" />);

    await confirm();

    expect(await screen.findByRole("status")).toHaveTextContent("Autenticação em duas etapas ativada.");
    expect(verifyTotp).toHaveBeenCalledWith("factor-1", "123456");
    expect(router.push).not.toHaveBeenCalled();
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

describe("MfaPanel — códigos de recuperação (#169)", () => {
  it("só conclui a ativação depois de o dono confirmar que guardou os códigos", async () => {
    const confirm = enrollAndConfirm();
    render(<MfaPanel factorId={null} verified={false} returnTo="/dashboard/configuracoes" />);

    await confirm();

    const list = await screen.findByRole("list", { name: "Códigos de recuperação" });
    expect(list.querySelectorAll("li")).toHaveLength(10);
    expect(list).toHaveTextContent("AB12C-DE30F");
    const finish = screen.getByRole("button", { name: "Continuar" });
    expect(finish).toBeDisabled();
    // With ?next= a refresh lets the page redirect the aal2 session away
    // before the codes are saved.
    expect(router.refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Guardei os códigos de recuperação em um lugar seguro"));
    fireEvent.click(finish);

    expect(router.push).toHaveBeenCalledWith("/dashboard/configuracoes");
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("list", { name: "Códigos de recuperação" })).not.toBeInTheDocument();
  });

  it("deixa tentar gerar os códigos de novo quando a geração falha", async () => {
    const confirm = enrollAndConfirm();
    vi.mocked(generateMfaRecoveryCodes).mockResolvedValueOnce({
      ok: false,
      code: "UNEXPECTED_ERROR",
      message: "Não foi possível gerar os códigos de recuperação.",
    });
    render(<MfaPanel factorId={null} verified={false} returnTo="/dashboard" />);

    await confirm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gerar os códigos de recuperação.");
    // O erro é gravado dentro da transição de verify: o alerta pode aparecer um
    // render antes de `pending` voltar a falso, e o botão só existe sem pending.
    // Sob CPU ocupada (suíte completa) os dois renders se separam.
    fireEvent.click(await screen.findByRole("button", { name: "Gerar códigos de recuperação" }));

    expect(await screen.findByRole("list", { name: "Códigos de recuperação" })).toBeInTheDocument();
  });

  it("avisa quem tem o autenticador ativo e ainda não tem códigos", async () => {
    render(<MfaPanel factorId="factor-1" verified recoveryCodesLeft={0} returnTo="/dashboard" />);

    expect(screen.getByText(/ainda não tem códigos de recuperação/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gerar códigos de recuperação" }));

    expect(await screen.findByRole("list", { name: "Códigos de recuperação" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Guardei os códigos de recuperação em um lugar seguro"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("list", { name: "Códigos de recuperação" })).not.toBeInTheDocument();
  });

  it("mostra quantos códigos restam e oferece gerar novos", () => {
    render(<MfaPanel factorId="factor-1" verified recoveryCodesLeft={7} returnTo="/dashboard" />);

    expect(screen.getByText(/7 códigos de recuperação disponíveis/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar novos códigos" })).toBeInTheDocument();
  });

  it("entra com um código de recuperação quando o dono perdeu o autenticador", async () => {
    vi.mocked(redeemMfaRecoveryCode).mockResolvedValue({ ok: true, data: undefined });
    const { rerender } = render(<MfaPanel factorId="factor-1" verified={false} returnTo="/dashboard" />);

    fireEvent.click(screen.getByRole("button", { name: "Perdi o acesso ao autenticador" }));
    expect(screen.queryByLabelText("Código de 6 dígitos")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Código de recuperação"), { target: { value: "ab12c-de30f" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar código de recuperação" }));

    await vi.waitFor(() => expect(redeemMfaRecoveryCode).toHaveBeenCalledWith("ab12c-de30f"));
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());

    // After the refresh the factor is gone and the session stays aal1.
    rerender(<MfaPanel factorId={null} verified={false} returnTo="/dashboard" />);
    expect(screen.getByRole("status")).toHaveTextContent("a autenticação em duas etapas foi desativada");
    expect(screen.getByRole("button", { name: "Ativar autenticador" })).toBeInTheDocument();
  });

  it("mostra o erro de um código de recuperação inválido", async () => {
    vi.mocked(redeemMfaRecoveryCode).mockResolvedValue({
      ok: false,
      code: "INVALID_CODE",
      message: "Código de recuperação inválido ou já usado.",
    });
    render(<MfaPanel factorId="factor-1" verified={false} returnTo="/dashboard" />);

    fireEvent.click(screen.getByRole("button", { name: "Perdi o acesso ao autenticador" }));
    fireEvent.change(screen.getByLabelText("Código de recuperação"), { target: { value: "AB12C-DE30F" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar código de recuperação" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Código de recuperação inválido ou já usado.");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

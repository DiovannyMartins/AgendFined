import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startUpgrade } from "@/lib/billing/actions";
import { MarketingPlanCta } from "./marketing-plan-cta";

vi.mock("@/lib/billing/actions", () => ({
  startUpgrade: vi.fn(),
}));

const mockedStartUpgrade = vi.mocked(startUpgrade);

describe("MarketingPlanCta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mantém o visitante anônimo no cadastro", () => {
    render(<MarketingPlanCta isAuthenticated={false} label="Assinar PROFISSIONAL" />);

    expect(screen.getByRole("link", { name: "Assinar PROFISSIONAL" })).toHaveAttribute(
      "href",
      "/cadastro",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("abre o checkout do Mercado Pago em uma nova aba para usuário autenticado", async () => {
    const checkoutWindow = {
      close: vi.fn(),
      location: { href: "" },
      opener: null,
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(checkoutWindow);
    mockedStartUpgrade.mockResolvedValue({
      ok: true,
      initPoint: "https://www.mercadopago.com.br/checkout/profissional",
    });

    render(<MarketingPlanCta isAuthenticated label="Assinar PROFISSIONAL" />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar PROFISSIONAL" }));

    await waitFor(() => {
      expect(mockedStartUpgrade).toHaveBeenCalledOnce();
      expect(checkoutWindow.location.href).toBe(
        "https://www.mercadopago.com.br/checkout/profissional",
      );
    });
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(checkoutWindow.opener).toBeNull();
  });

  it("desabilita o CTA enquanto o checkout está sendo criado", async () => {
    const checkoutWindow = {
      close: vi.fn(),
      location: { href: "" },
      opener: null,
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(checkoutWindow);

    let resolveUpgrade!: (value: Awaited<ReturnType<typeof startUpgrade>>) => void;
    mockedStartUpgrade.mockReturnValue(
      new Promise((resolve) => {
        resolveUpgrade = resolve;
      }),
    );

    render(<MarketingPlanCta isAuthenticated label="Assinar PROFISSIONAL" />);
    const button = screen.getByRole("button", { name: "Assinar PROFISSIONAL" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(screen.getByText("Redirecionando...")).toBeInTheDocument();
    });

    resolveUpgrade({
      ok: true,
      initPoint: "https://www.mercadopago.com.br/checkout/profissional",
    });
  });

  it("exibe a falha do billing e fecha a aba temporária", async () => {
    const checkoutWindow = {
      close: vi.fn(),
      location: { href: "" },
      opener: null,
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(checkoutWindow);
    mockedStartUpgrade.mockResolvedValue({
      ok: false,
      code: "NOT_CONFIGURED",
      message: "O pagamento ainda não está configurado neste ambiente.",
    });

    render(<MarketingPlanCta isAuthenticated label="Assinar PROFISSIONAL" />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar PROFISSIONAL" }));

    expect(
      await screen.findByRole("alert", {
        name: "O pagamento ainda não está configurado neste ambiente.",
      }),
    ).toBeInTheDocument();
    expect(checkoutWindow.close).toHaveBeenCalledOnce();
  });

  it("informa quando o navegador bloqueia a nova aba", () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    render(<MarketingPlanCta isAuthenticated label="Assinar PROFISSIONAL" />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar PROFISSIONAL" }));

    expect(
      screen.getByRole("alert", {
        name: "Permita pop-ups para abrir o checkout em uma nova aba.",
      }),
    ).toBeInTheDocument();
    expect(mockedStartUpgrade).not.toHaveBeenCalled();
  });
});

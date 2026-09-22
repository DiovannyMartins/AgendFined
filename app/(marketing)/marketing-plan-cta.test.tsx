import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryUpgrade, startUpgrade } from "@/lib/billing/actions";
import { navigateToCheckout } from "@/lib/billing/checkout-navigation";
import { MarketingPlanCta } from "./marketing-plan-cta";

vi.mock("@/lib/billing/actions", () => ({
  retryUpgrade: vi.fn(),
  startUpgrade: vi.fn(),
}));
vi.mock("@/lib/billing/checkout-navigation", () => ({
  navigateToCheckout: vi.fn(),
}));

const mockedStartUpgrade = vi.mocked(startUpgrade);
const mockedRetryUpgrade = vi.mocked(retryUpgrade);
const mockedNavigateToCheckout = vi.mocked(navigateToCheckout);

describe("MarketingPlanCta", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  it("navega para o checkout do Mercado Pago na mesma aba", async () => {
    mockedStartUpgrade.mockResolvedValue({
      ok: true,
      initPoint: "https://www.mercadopago.com.br/checkout/profissional",
    });

    render(<MarketingPlanCta isAuthenticated label="Assinar PROFISSIONAL" />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar PROFISSIONAL" }));

    await waitFor(() => {
      expect(mockedStartUpgrade).toHaveBeenCalledOnce();
    });
    expect(mockedNavigateToCheckout).toHaveBeenCalledWith(
      "https://www.mercadopago.com.br/checkout/profissional",
    );
  });

  it("gera um checkout novo quando já existe um pagamento pendente", async () => {
    mockedStartUpgrade.mockResolvedValue({
      ok: false,
      code: "UPGRADE_PENDING",
      message: "Você já iniciou uma assinatura. Conclua o pagamento para ativá-la.",
    });
    mockedRetryUpgrade.mockResolvedValue({
      ok: true,
      initPoint: "https://www.mercadopago.com.br/checkout/profissional-novo",
    });

    render(<MarketingPlanCta isAuthenticated label="Assinar PROFISSIONAL" />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar PROFISSIONAL" }));

    await waitFor(() => {
      expect(mockedStartUpgrade).toHaveBeenCalledOnce();
      expect(mockedRetryUpgrade).toHaveBeenCalledOnce();
    });
    expect(mockedNavigateToCheckout).toHaveBeenCalledWith(
      "https://www.mercadopago.com.br/checkout/profissional-novo",
    );
  });

  it("desabilita o CTA enquanto o checkout está sendo criado", async () => {
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

  it("exibe a falha do billing e permanece na página atual", async () => {
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
  });

});

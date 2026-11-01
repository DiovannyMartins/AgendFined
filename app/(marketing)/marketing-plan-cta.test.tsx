import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanOfferState, retryUpgrade, startUpgrade } from "@/lib/billing/actions";
import { navigateToCheckout } from "@/lib/billing/checkout-navigation";
import { MarketingPlanCta } from "./marketing-plan-cta";

vi.mock("@/lib/billing/actions", () => ({
  getPlanOfferState: vi.fn(),
  retryUpgrade: vi.fn(),
  startUpgrade: vi.fn(),
}));
vi.mock("@/lib/billing/checkout-navigation", () => ({
  navigateToCheckout: vi.fn(),
}));

const mockedGetPlanOfferState = vi.mocked(getPlanOfferState);
const mockedStartUpgrade = vi.mocked(startUpgrade);
const mockedRetryUpgrade = vi.mocked(retryUpgrade);
const mockedNavigateToCheckout = vi.mocked(navigateToCheckout);

describe("MarketingPlanCta", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("leva o visitante anônimo ao cadastro para começar o teste grátis", () => {
    render(<MarketingPlanCta isAuthenticated={false} />);

    expect(screen.getByRole("link", { name: "Começar teste grátis" })).toHaveAttribute("href", "/cadastro");
    expect(screen.getByText("30 dias grátis, sem cartão")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mockedGetPlanOfferState).not.toHaveBeenCalled();
  });

  it("oferece ao dono em teste assinar sem perder os dias", async () => {
    mockedGetPlanOfferState.mockResolvedValue("trial");
    render(<MarketingPlanCta isAuthenticated />);

    expect(await screen.findByRole("button", { name: "Assinar sem perder os dias do teste" })).toBeEnabled();
    expect(screen.getByText("A primeira cobrança acontece na data do fim do teste.")).toBeInTheDocument();
  });

  it("oferece ao dono suspenso assinar para reativar", async () => {
    mockedGetPlanOfferState.mockResolvedValue("suspended");
    render(<MarketingPlanCta isAuthenticated />);

    expect(await screen.findByRole("button", { name: "Assinar para reativar" })).toBeEnabled();
  });

  it("leva o assinante à própria assinatura em vez de abrir outro checkout", async () => {
    mockedGetPlanOfferState.mockResolvedValue("subscribed");
    render(<MarketingPlanCta isAuthenticated />);

    expect(await screen.findByRole("link", { name: "Ver minha assinatura" })).toHaveAttribute(
      "href",
      "/dashboard/configuracoes#plano",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("navega para o checkout do Mercado Pago na mesma aba", async () => {
    mockedStartUpgrade.mockResolvedValue({
      ok: true,
      initPoint: "https://www.mercadopago.com.br/checkout/plano",
    });

    render(<MarketingPlanCta isAuthenticated offerState="trial" />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar sem perder os dias do teste" }));

    await waitFor(() => {
      expect(mockedStartUpgrade).toHaveBeenCalledOnce();
    });
    expect(mockedNavigateToCheckout).toHaveBeenCalledWith("https://www.mercadopago.com.br/checkout/plano");
  });

  it("gera um checkout novo quando já existe um pagamento pendente", async () => {
    mockedStartUpgrade.mockResolvedValue({
      ok: false,
      code: "UPGRADE_PENDING",
      message: "Você já iniciou uma assinatura. Conclua o pagamento para ativá-la.",
    });
    mockedRetryUpgrade.mockResolvedValue({
      ok: true,
      initPoint: "https://www.mercadopago.com.br/checkout/plano-novo",
    });

    render(<MarketingPlanCta isAuthenticated offerState="suspended" />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar para reativar" }));

    await waitFor(() => {
      expect(mockedStartUpgrade).toHaveBeenCalledOnce();
      expect(mockedRetryUpgrade).toHaveBeenCalledOnce();
    });
    expect(mockedNavigateToCheckout).toHaveBeenCalledWith("https://www.mercadopago.com.br/checkout/plano-novo");
  });

  it("desabilita o CTA enquanto o checkout está sendo criado", async () => {
    let resolveUpgrade!: (value: Awaited<ReturnType<typeof startUpgrade>>) => void;
    mockedStartUpgrade.mockReturnValue(
      new Promise((resolve) => {
        resolveUpgrade = resolve;
      }),
    );

    render(<MarketingPlanCta isAuthenticated offerState="trial" />);
    const button = screen.getByRole("button", { name: "Assinar sem perder os dias do teste" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(screen.getByText("Redirecionando...")).toBeInTheDocument();
    });

    resolveUpgrade({
      ok: true,
      initPoint: "https://www.mercadopago.com.br/checkout/plano",
    });
  });

  it("exibe a falha do billing e permanece na página atual", async () => {
    mockedStartUpgrade.mockResolvedValue({
      ok: false,
      code: "NOT_CONFIGURED",
      message: "O pagamento ainda não está configurado neste ambiente.",
    });

    render(<MarketingPlanCta isAuthenticated offerState="active" />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar o Plano AgendFined" }));

    expect(
      await screen.findByRole("alert", {
        name: "O pagamento ainda não está configurado neste ambiente.",
      }),
    ).toBeInTheDocument();
  });
});

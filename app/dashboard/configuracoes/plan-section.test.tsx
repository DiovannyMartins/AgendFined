import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSubscription } from "@/lib/billing/get-subscription";
import type { BillingSubscription } from "@/lib/billing/types";
import { PlanSection } from "./plan-section";

vi.mock("@/lib/billing/get-subscription", () => ({
  getSubscription: vi.fn(async () => ({
    plan: "free",
    subscription: null,
    graceSubscription: null,
  })),
}));

vi.mock("./upgrade-button", () => ({
  UpgradeButton: ({ label = "Fazer upgrade" }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock("./cancel-subscription-button", () => ({
  CancelSubscriptionButton: ({ activeUntil }: { activeUntil: { date: string; atLeast: boolean } }) => (
    <button type="button" data-active-until={activeUntil.date} data-at-least={String(activeUntil.atLeast)}>
      Cancelar assinatura
    </button>
  ),
}));

vi.mock("./retry-upgrade-button", () => ({
  RetryUpgradeButton: ({ label = "Concluir pagamento" }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));

const NOW = new Date("2026-10-20T15:00:00.000Z");

function subscription(overrides: Partial<BillingSubscription>): BillingSubscription {
  return {
    mpPreapprovalId: "mp_1",
    status: "authorized",
    plan: "pro",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    gracePeriodEnd: null,
    ...overrides,
  };
}

describe("PlanSection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "free",
      subscription: null,
      graceSubscription: null,
    });
  });

  it("shows the current Free plan and the Pro offer with the configured price", async () => {
    render(await PlanSection({ business: { id: "biz_1", plan: "free" } }));

    expect(screen.getByText("Grátis", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Atual", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("PROFISSIONAL", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/R\$ 19,90/)).toBeInTheDocument();
    expect(screen.getByText("Relatórios", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assinar PROFISSIONAL" })).toBeInTheDocument();
    expect(screen.queryByText("Recomendado", { exact: true })).not.toBeInTheDocument();
  });

  it("keeps the active Pro controls without a duplicate upgrade offer", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "pro",
      subscription: {
        mpPreapprovalId: "mp_1",
        status: "authorized",
        plan: "pro",
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
      graceSubscription: null,
    });

    render(await PlanSection({ business: { id: "biz_1", plan: "pro" } }));

    expect(screen.getByText("PROFISSIONAL", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Assinatura ativa", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar assinatura" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assinar PROFISSIONAL" })).not.toBeInTheDocument();
  });

  it("keeps the Pro offer visible while prioritizing the pending checkout", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "free",
      subscription: {
        mpPreapprovalId: "mp_pending",
        status: "pending",
        plan: "pro",
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
      graceSubscription: null,
    });

    render(await PlanSection({ business: { id: "biz_1", plan: "free" } }));

    expect(screen.queryByText("Checkout não concluído", { exact: true })).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "O link de pagamento foi criado, mas a assinatura ainda não foi autorizada. Clique abaixo para abrir um novo checkout.",
        { exact: true },
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Atual", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Pendente", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("PROFISSIONAL", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/R\$ 19,90/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fazer upgrade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assinar PROFISSIONAL" })).not.toBeInTheDocument();
  });

  it("tells a failed payment apart from a cancellation and asks for a new payment method", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "pro",
      subscription: subscription({ status: "paused", gracePeriodEnd: "2026-10-27T15:00:00.000Z" }),
      graceSubscription: null,
    });

    render(await PlanSection({ business: { id: "biz_1", plan: "pro", timezone: "America/Sao_Paulo" } }));

    expect(
      screen.getByText(
        "Não conseguimos cobrar a sua assinatura. Atualize a forma de pagamento até 27/10/2026 para manter o PROFISSIONAL.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar forma de pagamento" })).toBeInTheDocument();
    expect(screen.queryByText(/Mudou de ideia/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Termina em/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar assinatura" })).not.toBeInTheDocument();
  });

  it("says until when a cancelled assinatura keeps the PROFISSIONAL, as a date", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "pro",
      subscription: subscription({ status: "cancelled", gracePeriodEnd: "2026-11-21T15:00:00.000Z" }),
      graceSubscription: null,
    });

    render(await PlanSection({ business: { id: "biz_1", plan: "pro", timezone: "America/Sao_Paulo" } }));

    expect(
      screen.getByText("Seu PROFISSIONAL fica ativo até 21/11/2026. Depois, o negócio volta ao Grátis, sem perder dados."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assinar novamente" })).toBeInTheDocument();
    expect(screen.queryByText(/Termina em/)).not.toBeInTheDocument();
  });

  it("keeps the grace date while a new checkout is still unpaid", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "pro",
      subscription: subscription({ mpPreapprovalId: "mp_new", status: "pending" }),
      graceSubscription: subscription({ status: "paused", gracePeriodEnd: "2026-10-27T15:00:00.000Z" }),
    });

    render(await PlanSection({ business: { id: "biz_1", plan: "pro", timezone: "America/Sao_Paulo" } }));

    expect(
      screen.getByText(
        "Novo pagamento em andamento. Seu PROFISSIONAL fica ativo até 27/10/2026; se o pagamento não for concluído, o plano volta para Grátis.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir pagamento" })).toBeInTheDocument();
  });

  it("shows the next charge of an active assinatura and previews it in the cancel dialog", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "pro",
      subscription: subscription({ currentPeriodEnd: "2026-11-21T15:00:00.000Z" }),
      graceSubscription: null,
    });

    render(await PlanSection({ business: { id: "biz_1", plan: "pro", timezone: "America/Sao_Paulo" } }));

    expect(screen.getByText("21/11/2026")).toBeInTheDocument();
    expect(screen.getByText(/Próxima cobrança em/)).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancelar assinatura" });
    expect(cancel).toHaveAttribute("data-active-until", "21/11/2026");
    expect(cancel).toHaveAttribute("data-at-least", "false");
  });

  it("promises only the 7-day minimum in the cancel dialog without a known next charge", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "pro",
      subscription: subscription({}),
      graceSubscription: null,
    });

    render(await PlanSection({ business: { id: "biz_1", plan: "pro", timezone: "America/Sao_Paulo" } }));

    expect(screen.queryByText(/Próxima cobrança em/)).not.toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancelar assinatura" });
    expect(cancel).toHaveAttribute("data-active-until", "27/10/2026");
    expect(cancel).toHaveAttribute("data-at-least", "true");
  });
});

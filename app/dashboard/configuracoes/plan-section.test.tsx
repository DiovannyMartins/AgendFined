import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSubscription } from "@/lib/billing/get-subscription";
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
  CancelSubscriptionButton: () => <button type="button">Cancelar assinatura</button>,
}));

vi.mock("./retry-upgrade-button", () => ({
  RetryUpgradeButton: ({ label = "Concluir pagamento" }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));

describe("PlanSection", () => {
  beforeEach(() => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: "free",
      subscription: null,
      graceSubscription: null,
    });
  });

  it("shows the current Free plan and the Pro offer with the test price", async () => {
    render(await PlanSection({ business: { id: "biz_1", plan: "free" } }));

    expect(screen.getByText("Grátis", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Atual", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("PROFISSIONAL", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/R\$ 1\/mês/)).toBeInTheDocument();
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

    expect(screen.getByText("Checkout não concluído", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Atual", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Pendente", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("PROFISSIONAL", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/R\$ 1\/mês/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fazer upgrade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assinar PROFISSIONAL" })).not.toBeInTheDocument();
  });
});

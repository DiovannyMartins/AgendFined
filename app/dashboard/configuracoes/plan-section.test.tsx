import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSubscription } from "@/lib/billing/get-subscription";
import type { BillingSubscription } from "@/lib/billing/types";
import { PlanSection } from "./plan-section";

vi.mock("@/lib/billing/get-subscription", () => ({
  getSubscription: vi.fn(async () => ({
    subscription: null,
    graceSubscription: null,
  })),
}));

vi.mock("./upgrade-button", () => ({
  UpgradeButton: ({ label = "Assinar" }: { label?: string }) => (
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
    currentPeriodStart: null,
    currentPeriodEnd: null,
    gracePeriodEnd: null,
    ...overrides,
  };
}

type SectionBusiness = Parameters<typeof PlanSection>[0]["business"];

function business(overrides: Partial<SectionBusiness> = {}): SectionBusiness {
  return {
    id: "biz_1",
    timezone: "America/Sao_Paulo",
    hasAccess: true,
    trialEndsAt: null,
    ...overrides,
  };
}

describe("PlanSection (ADR 0013)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: null,
      graceSubscription: null,
    });
  });

  it("shows the single Plano AgendFined with its price and everything included", async () => {
    render(await PlanSection({ business: business({ trialEndsAt: "2026-11-10T15:00:00+00:00" }) }));

    expect(screen.getByText("Plano AgendFined", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/R\$ 19,90/)).toBeInTheDocument();
    expect(screen.getByText("Relatórios", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Reservas futuras até 365 dias", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/PROFISSIONAL/)).not.toBeInTheDocument();
  });

  it("shows the teste grátis with its end date and offers to subscribe", async () => {
    render(await PlanSection({ business: business({ trialEndsAt: "2026-11-10T15:00:00+00:00" }) }));

    expect(screen.getByText("Teste grátis", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("10/11/2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assinar" })).toBeInTheDocument();
  });

  it("does not show a teste for a negócio older than the plano único (infinity)", async () => {
    render(await PlanSection({ business: business({ trialEndsAt: "infinity" }) }));

    expect(screen.queryByText("Teste grátis", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.getByText("Sem assinatura", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assinar" })).toBeInTheDocument();
  });

  it("shows a suspended negócio, what it keeps and the button to subscribe", async () => {
    render(
      await PlanSection({
        business: business({ hasAccess: false, trialEndsAt: "2026-10-01T15:00:00+00:00" }),
      }),
    );

    expect(screen.getByText("Suspenso", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Seu negócio está suspenso.")).toBeInTheDocument();
    expect(screen.getByText(/Seus dados continuam guardados/)).toBeInTheDocument();
    expect(screen.queryByText("Este telefone ou e-mail já usou o teste grátis.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assinar" })).toBeInTheDocument();
  });

  it("tells a negócio born without a teste that its telefone or e-mail already used one", async () => {
    render(
      await PlanSection({ business: business({ hasAccess: false, trialEndsAt: null, currentSubscriptionId: null }) }),
    );

    expect(screen.getByText("Este telefone ou e-mail já usou o teste grátis.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assinar" })).toBeInTheDocument();
  });

  it("keeps the active assinatura controls without a subscribe offer", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({}),
      graceSubscription: null,
    });

    render(await PlanSection({ business: business({ currentSubscriptionId: "sub_1" }) }));

    expect(screen.getByText("Ativo", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Assinatura ativa", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar assinatura" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
  });

  it("resumes a pending checkout instead of opening another one", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({ mpPreapprovalId: "mp_pending", status: "pending" }),
      graceSubscription: null,
    });

    render(await PlanSection({ business: business({ currentSubscriptionId: "sub_1", trialEndsAt: "infinity" }) }));

    expect(screen.getByText("Checkout não concluído", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir pagamento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
  });

  it("tells a failed payment apart from a cancellation and asks for a new payment method", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({ status: "paused", gracePeriodEnd: "2026-10-27T15:00:00.000Z" }),
      graceSubscription: null,
    });

    render(await PlanSection({ business: business({ currentSubscriptionId: "sub_1" }) }));

    expect(
      screen.getByText(
        "Não conseguimos cobrar a sua assinatura. Atualize a forma de pagamento até 27/10/2026 para não suspender o negócio.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar forma de pagamento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar assinatura" })).not.toBeInTheDocument();
  });

  it("says until when a cancelled assinatura keeps the access and that the negócio is suspended after", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({ status: "cancelled", gracePeriodEnd: "2026-11-21T15:00:00.000Z" }),
      graceSubscription: null,
    });

    render(await PlanSection({ business: business({ currentSubscriptionId: "sub_1" }) }));

    expect(
      screen.getByText("Seu acesso continua até 21/11/2026. Depois, o negócio fica suspenso, sem perder dados."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assinar novamente" })).toBeInTheDocument();
  });

  it("keeps the grace date while a new checkout is still unpaid", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({ mpPreapprovalId: "mp_new", status: "pending" }),
      graceSubscription: subscription({ status: "paused", gracePeriodEnd: "2026-10-27T15:00:00.000Z" }),
    });

    render(await PlanSection({ business: business({ currentSubscriptionId: "sub_1" }) }));

    expect(
      screen.getByText(
        "Novo pagamento em andamento. Seu acesso continua até 27/10/2026; se o pagamento não for concluído, o negócio fica suspenso.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir pagamento" })).toBeInTheDocument();
  });

  it("shows the next charge of an active assinatura and previews it in the cancel dialog", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({ currentPeriodEnd: "2026-11-21T15:00:00.000Z" }),
      graceSubscription: null,
    });

    render(await PlanSection({ business: business({ currentSubscriptionId: "sub_1" }) }));

    expect(screen.getByText("21/11/2026")).toBeInTheDocument();
    expect(screen.getByText(/Próxima cobrança em/)).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancelar assinatura" });
    expect(cancel).toHaveAttribute("data-active-until", "21/11/2026");
    expect(cancel).toHaveAttribute("data-at-least", "false");
  });

  it("promises only the 7-day minimum in the cancel dialog without a known next charge", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({}),
      graceSubscription: null,
    });

    render(await PlanSection({ business: business({ currentSubscriptionId: "sub_1" }) }));

    expect(screen.queryByText(/Próxima cobrança em/)).not.toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancelar assinatura" });
    expect(cancel).toHaveAttribute("data-active-until", "27/10/2026");
    expect(cancel).toHaveAttribute("data-at-least", "true");
  });
});

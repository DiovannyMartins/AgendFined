import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSubscription } from "@/lib/billing/get-subscription";
import type { BillingSubscription } from "@/lib/billing/types";
import { GraceBanner } from "./grace-banner";

vi.mock("@/lib/billing/get-subscription", () => ({ getSubscription: vi.fn() }));

const BUSINESS = { id: "biz_1", timezone: "America/Sao_Paulo" };

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

describe("GraceBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("warns about a failed payment anywhere in the painel and links to the Plano section", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({ status: "paused", gracePeriodEnd: "2026-10-27T15:00:00.000Z" }),
      graceSubscription: null,
    });

    render((await GraceBanner({ business: BUSINESS }))!);

    expect(
      screen.getByText(
        "Não conseguimos cobrar a sua assinatura. Atualize a forma de pagamento até 27/10/2026 para não suspender o negócio.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Atualizar pagamento" })).toHaveAttribute(
      "href",
      "/dashboard/configuracoes#plano",
    );
  });

  it("reminds a cancelled assinatura of the date the access ends", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({ status: "cancelled", gracePeriodEnd: "2026-11-21T15:00:00.000Z" }),
      graceSubscription: null,
    });

    render((await GraceBanner({ business: BUSINESS }))!);

    expect(screen.getByText(/Seu acesso continua até 21\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reativar assinatura" })).toBeInTheDocument();
  });

  it("renders nothing for an active assinatura or when the read fails", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      subscription: subscription({}),
      graceSubscription: null,
    });
    expect(await GraceBanner({ business: BUSINESS })).toBeNull();

    vi.mocked(getSubscription).mockRejectedValue(new Error("db down"));
    expect(await GraceBanner({ business: BUSINESS })).toBeNull();
  });

  it("skips the assinatura read without a subscription", async () => {
    vi.mocked(getSubscription).mockClear();
    expect(await GraceBanner({ business: { ...BUSINESS, currentSubscriptionId: null } })).toBeNull();
    expect(getSubscription).not.toHaveBeenCalled();
  });
});

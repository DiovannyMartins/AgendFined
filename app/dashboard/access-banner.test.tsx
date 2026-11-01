import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSubscription } from "@/lib/billing/get-subscription";
import { AccessBanner, type AccessBannerBusiness } from "./access-banner";

vi.mock("@/lib/billing/get-subscription", () => ({
  getSubscription: vi.fn(async () => ({ plan: "free", subscription: null, graceSubscription: null })),
}));

const NOW = new Date("2026-10-31T12:00:00.000Z");

function business(overrides: Partial<AccessBannerBusiness> = {}): AccessBannerBusiness {
  return { id: "biz", plan: "free", currentSubscriptionId: null, hasAccess: true, trialEndsAt: null, ...overrides };
}

async function renderBanner(overrides: Partial<AccessBannerBusiness> = {}) {
  const element = await AccessBanner({ business: business(overrides) });
  if (element) render(element);
}

describe("AccessBanner (ADR 0013)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    vi.mocked(getSubscription).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("counts the days left of the teste and links to subscribe", async () => {
    await renderBanner({ trialEndsAt: "2026-11-20T12:00:00+00:00" });

    expect(screen.getByRole("status")).toHaveTextContent("Faltam 20 dias do seu teste grátis");
    expect(screen.getByRole("link", { name: "Assinar" })).toHaveAttribute("href", "/dashboard/configuracoes#plano");
    expect(screen.getByRole("status").className).not.toContain("amber");
  });

  it("highlights the last 3 days", async () => {
    await renderBanner({ trialEndsAt: "2026-11-03T12:00:00+00:00" });

    expect(screen.getByRole("status")).toHaveTextContent("Faltam 3 dias do seu teste grátis");
    expect(screen.getByRole("status").className).toContain("amber");
  });

  it("shows nothing for infinity, for no teste or for an ended teste", async () => {
    for (const trialEndsAt of ["infinity", null, "2026-10-30T12:00:00+00:00"]) {
      await renderBanner({ trialEndsAt });
    }
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid/)).not.toBeInTheDocument();
  });

  it("shows nothing to whoever subscribed during the teste", async () => {
    vi.mocked(getSubscription).mockResolvedValueOnce({
      plan: "pro",
      subscription: {
        mpPreapprovalId: "mp",
        status: "authorized",
        plan: "pro",
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
      graceSubscription: null,
    });

    await renderBanner({ trialEndsAt: "2026-11-20T12:00:00+00:00", currentSubscriptionId: "sub" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("skips the assinatura read when there is none", async () => {
    await renderBanner({ trialEndsAt: "2026-11-20T12:00:00+00:00" });
    expect(getSubscription).not.toHaveBeenCalled();
  });

  it("explains the suspension and what still works", async () => {
    await renderBanner({ hasAccess: false, trialEndsAt: "2026-10-01T12:00:00+00:00" });

    expect(screen.getByRole("alert")).toHaveTextContent("Seu negócio está suspenso.");
    expect(screen.getByRole("alert")).toHaveTextContent("cancelar reservas");
    expect(screen.queryByText("Este telefone ou e-mail já usou o teste grátis.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assinar" })).toBeInTheDocument();
  });

  it("tells a negócio born without a teste that its telefone or e-mail already used one", async () => {
    await renderBanner({ hasAccess: false, trialEndsAt: null });

    expect(screen.getByText("Este telefone ou e-mail já usou o teste grátis.")).toBeInTheDocument();
  });
});

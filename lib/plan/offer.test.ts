import { describe, expect, it } from "vitest";
import { planOffer, planOfferState } from "./offer";

const NOW = new Date("2026-11-01T12:00:00Z");

describe("planOfferState", () => {
  it("vê o teste grátis vigente de quem ainda não assinou", () => {
    expect(
      planOfferState({ hasAccess: true, trialEndsAt: "2026-11-20T12:00:00+00:00", subscriptionStatus: null }, NOW),
    ).toBe("trial");
  });

  it("um checkout pendente durante o teste continua sendo teste", () => {
    expect(
      planOfferState({ hasAccess: true, trialEndsAt: "2026-11-20T12:00:00+00:00", subscriptionStatus: "pending" }, NOW),
    ).toBe("trial");
  });

  it("quem assinou durante o teste já é assinante", () => {
    expect(
      planOfferState({ hasAccess: true, trialEndsAt: "2026-11-20T12:00:00+00:00", subscriptionStatus: "authorized" }, NOW),
    ).toBe("subscribed");
  });

  it("sem acesso, o negócio está suspenso", () => {
    expect(
      planOfferState({ hasAccess: false, trialEndsAt: "2026-10-01T12:00:00+00:00", subscriptionStatus: null }, NOW),
    ).toBe("suspended");
    expect(planOfferState({ hasAccess: false, trialEndsAt: null, subscriptionStatus: "cancelled" }, NOW)).toBe(
      "suspended",
    );
  });

  it("negócio anterior ao plano único ou em carência tem acesso sem teste com fim", () => {
    expect(planOfferState({ hasAccess: true, trialEndsAt: "infinity", subscriptionStatus: null }, NOW)).toBe("active");
    expect(planOfferState({ hasAccess: true, trialEndsAt: null, subscriptionStatus: "cancelled" }, NOW)).toBe("active");
  });
});

describe("planOffer", () => {
  it("leva o visitante ao cadastro para começar o teste grátis", () => {
    expect(planOffer("anonymous")).toEqual({
      kind: "link",
      href: "/cadastro",
      label: "Começar teste grátis",
      note: "30 dias grátis, sem cartão",
    });
  });

  it("leva quem ainda não criou o negócio a concluir o cadastro", () => {
    expect(planOffer("no_business")).toMatchObject({ kind: "link", href: "/dashboard", label: "Concluir cadastro" });
  });

  it("em teste, assina sem perder os dias, com a primeira cobrança no fim do teste", () => {
    expect(planOffer("trial")).toEqual({
      kind: "checkout",
      label: "Assinar sem perder os dias do teste",
      note: "A primeira cobrança acontece na data do fim do teste.",
    });
  });

  it("suspenso, assina para reativar e é cobrado na hora", () => {
    expect(planOffer("suspended")).toEqual({
      kind: "checkout",
      label: "Assinar para reativar",
      note: "A cobrança começa na hora e o negócio volta a receber reservas.",
    });
  });

  it("com acesso sem teste, assina com a cobrança na hora", () => {
    expect(planOffer("active")).toMatchObject({ kind: "checkout", label: "Assinar o Plano AgendFined" });
  });

  it("assinante vai para a própria assinatura no painel", () => {
    expect(planOffer("subscribed")).toEqual({
      kind: "link",
      href: "/dashboard/configuracoes#plano",
      label: "Ver minha assinatura",
      note: "Você já assina o Plano AgendFined",
    });
  });
});

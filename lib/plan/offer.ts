// What the card of the Plano AgendFined offers on the marketing page (ADR 0013,
// spec 007 FR-015). A visitor starts the teste grátis; a signed-in dono gets the
// next step for their negócio: subscribe during the teste without losing its
// days, subscribe to reactivate a suspenso negócio, or see the assinatura they
// already have. No "server-only": the client CTA renders it.
import type { SubscriptionStatus } from "@/lib/billing/types";
import { parseTrialEndsAt } from "./trial";

export type PlanOfferState = "anonymous" | "no_business" | "trial" | "suspended" | "subscribed" | "active";

export type PlanOffer =
  | { kind: "link"; href: string; label: string; note: string }
  | { kind: "checkout"; label: string; note: string };

// The state of a signed-in dono's negócio. Access comes from
// `business_has_access()`; "active" is access without a running teste and
// without an assinatura `authorized`: a negócio in carência (ADR 0008).
export function planOfferState(
  business: { hasAccess: boolean; trialEndsAt: string | null; subscriptionStatus: SubscriptionStatus | null },
  now: Date = new Date(),
): Exclude<PlanOfferState, "anonymous" | "no_business"> {
  if (business.subscriptionStatus === "authorized") return "subscribed";
  if (!business.hasAccess) return "suspended";
  const trialEnd = parseTrialEndsAt(business.trialEndsAt);
  if (trialEnd && trialEnd.getTime() > now.getTime()) return "trial";
  return "active";
}

export function planOffer(state: PlanOfferState): PlanOffer {
  switch (state) {
    case "anonymous":
      return { kind: "link", href: "/cadastro", label: "Começar teste grátis", note: "30 dias grátis, sem cartão" };
    case "no_business":
      return {
        kind: "link",
        href: "/dashboard",
        label: "Concluir cadastro",
        note: "Crie seu negócio para começar o teste grátis",
      };
    case "trial":
      return {
        kind: "checkout",
        label: "Assinar sem perder os dias do teste",
        note: "A primeira cobrança acontece na data do fim do teste.",
      };
    case "suspended":
      return {
        kind: "checkout",
        label: "Assinar para reativar",
        note: "A cobrança começa na hora e o negócio volta a receber reservas.",
      };
    case "active":
      return { kind: "checkout", label: "Assinar o Plano AgendFined", note: "A cobrança começa na hora." };
    case "subscribed":
      return {
        kind: "link",
        href: "/dashboard/configuracoes#plano",
        label: "Ver minha assinatura",
        note: "Você já assina o Plano AgendFined",
      };
  }
}

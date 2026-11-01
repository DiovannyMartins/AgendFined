// Plan catalog (ADR 0013). Single source of truth for the human-facing plan
// metadata (name, price, period, description, privilege list), shared by the
// landing page (app/(marketing)/plans.tsx) and the dashboard "Plano" section
// (lib/billing/plans re-exports it). `access.ts` is the behavioral gate seam; this
// file is only the catalog, so the two never drift.
import "server-only";
import { formatCurrencyBRL } from "@/lib/format/currency";
import type { Plan } from "./plan";

export interface PlanInfo {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
}

export function getProPriceCents(): number {
  const raw = process.env.MERCADO_PAGO_PRO_AMOUNT_CENTS?.trim() || "1990";
  const cents = Number(raw);
  if (!Number.isInteger(cents) || cents < 100 || cents > 1_000_000) {
    throw new Error("MERCADO_PAGO_PRO_AMOUNT_CENTS must be an integer between 100 and 1000000.");
  }
  return cents;
}

export const PLAN_INFO: Record<Plan, PlanInfo> = {
  free: {
    name: "Grátis",
    price: "R$ 0",
    period: "/mês",
    description: "O essencial para receber reservas online.",
    features: [
      "Página pública",
      "Dashboard",
      "Serviços ilimitados",
      "Clientes e histórico",
      "Bloqueios",
      "Gestão de reservas",
      "Cancelamento self-service",
      "Reservas futuras até 90 dias",
    ],
  },
  pro: {
    name: "PROFISSIONAL",
    price: formatCurrencyBRL(getProPriceCents()),
    period: "/mês",
    description:
      "Inclui todos os recursos do plano Grátis, além de funcionalidades avançadas para otimizar a gestão do seu negócio.",
    features: [
      "Relatórios",
      "Lembretes automáticos",
      "Gestão da lista de espera",
      "Exportação Google Calendar/.ics",
      "Reservas futuras até 365 dias",
    ],
  },
};

// The Plano AgendFined (ADR 0013), the only plan, as the painel shows it: what
// was the PROFISSIONAL, everything included. The marketing page still shows
// PLAN_INFO until #261, fase 6, which moves it here too.
export const AGENDFINED_PLAN_INFO: PlanInfo = {
  name: "Plano AgendFined",
  price: formatCurrencyBRL(getProPriceCents()),
  period: "/mês",
  description: "Tudo o que o AgendFined oferece para receber e organizar as reservas do seu negócio.",
  features: [
    "Página pública",
    "Serviços ilimitados",
    "Clientes e histórico",
    "Bloqueios",
    "Relatórios",
    "Lembretes automáticos",
    "Gestão da lista de espera",
    "Exportação Google Calendar/.ics",
    "Reservas futuras até 365 dias",
  ],
};

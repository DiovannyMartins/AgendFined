// Plan catalog (ADR 0013). Single source of truth for the human-facing metadata
// of the Plano AgendFined (name, price, period, description, what is included),
// shared by the landing page (app/(marketing)/plans.tsx), the dashboard "Plano"
// section and the e-mails of the teste grátis. `access.ts` is the behavioral
// gate seam; this file is only the catalog, so the two never drift.
import "server-only";
import { formatCurrencyBRL } from "@/lib/format/currency";

export interface PlanInfo {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
}

// The monthly price of the Plano AgendFined. The env name keeps the "PRO" of
// the plan it was created for, so production config does not have to change.
export function getPlanPriceCents(): number {
  const raw = process.env.MERCADO_PAGO_PRO_AMOUNT_CENTS?.trim() || "1990";
  const cents = Number(raw);
  if (!Number.isInteger(cents) || cents < 100 || cents > 1_000_000) {
    throw new Error("MERCADO_PAGO_PRO_AMOUNT_CENTS must be an integer between 100 and 1000000.");
  }
  return cents;
}

// The Plano AgendFined (ADR 0013), the only plan, everything included.
export const AGENDFINED_PLAN_INFO: PlanInfo = {
  name: "Plano AgendFined",
  price: formatCurrencyBRL(getPlanPriceCents()),
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

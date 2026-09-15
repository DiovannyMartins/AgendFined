// Plan catalog (ADR 0008). Single source of truth for the human-facing plan
// metadata (name, price, period, description, privilege list), shared by the
// landing page (app/(marketing)/plans.tsx) and the dashboard "Plano" section
// (lib/billing/plans re-exports it). `plan.ts` is the behavioral gate seam; this
// file is only the catalog, so the two never drift.
import type { Plan } from "./plan";

export interface PlanInfo {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
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
    ],
  },
  pro: {
    name: "PROFISSIONAL",
    price: "R$ 1",
    period: "/mês",
    description: "Tudo do Grátis, mais recursos para fazer o negócio crescer.",
    features: [
      "Relatórios",
      "Lembretes automáticos",
      "Gestão da lista de espera",
      "Exportação Google Calendar/.ics",
    ],
  },
};

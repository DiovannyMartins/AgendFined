import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSubscription } from "@/lib/billing/get-subscription";
import { graceNotice, type GraceNotice } from "@/lib/billing/grace-notice";
import type { BillingPlan } from "@/lib/billing/types";
import { formatDate } from "@/lib/format/when";
import { cn } from "@/lib/utils";

// Painel-wide warning while the negócio keeps its access only because of the
// carência (issue #151, ADR 0008): without it the dono learns that the negócio
// will be suspended (ADR 0013) only in Configurações, after it happened. A
// failed read hides the banner instead of breaking the painel.
export async function GraceBanner({
  business,
}: {
  business: { id: string; plan: BillingPlan; timezone: string; currentSubscriptionId?: string | null };
}) {
  // A carência only exists on a subscribed negócio (plan = pro until #261, fase 4);
  // the others skip the read (#214).
  if (business.plan !== "pro") return null;
  let notice: GraceNotice | null;
  try {
    notice = graceNotice(await getSubscription(business));
  } catch {
    return null;
  }
  if (!notice) return null;

  const activeUntil = formatDate(notice.activeUntil, business.timezone);
  const message = notice.checkoutInProgress
    ? `Novo pagamento em andamento. Seu acesso continua até ${activeUntil}; conclua o pagamento para não suspender o negócio.`
    : notice.reason === "payment_failed"
      ? `Não conseguimos cobrar a sua assinatura. Atualize a forma de pagamento até ${activeUntil} para não suspender o negócio.`
      : `Sua assinatura foi cancelada. Seu acesso continua até ${activeUntil}; depois, o negócio fica suspenso, sem perder dados.`;
  const action = notice.checkoutInProgress
    ? "Concluir pagamento"
    : notice.reason === "payment_failed"
      ? "Atualizar pagamento"
      : "Reativar assinatura";

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        {message}
      </p>
      <Link
        href="/dashboard/configuracoes#plano"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
      >
        {action}
      </Link>
    </div>
  );
}

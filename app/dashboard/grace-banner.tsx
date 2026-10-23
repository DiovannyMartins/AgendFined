import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSubscription } from "@/lib/billing/get-subscription";
import { graceNotice, type GraceNotice } from "@/lib/billing/grace-notice";
import type { BillingPlan } from "@/lib/billing/types";
import { formatDate } from "@/lib/format/when";
import { cn } from "@/lib/utils";

// Painel-wide warning while the negócio keeps the PROFISSIONAL only because of
// the carência (issue #151): without it the dono learns about the downgrade
// only in Configurações, after losing the recursos. A failed read hides the
// banner instead of breaking the painel.
export async function GraceBanner({
  business,
}: {
  business: { id: string; plan: BillingPlan; timezone: string };
}) {
  let notice: GraceNotice | null;
  try {
    notice = graceNotice(await getSubscription(business));
  } catch {
    return null;
  }
  if (!notice) return null;

  const activeUntil = formatDate(notice.activeUntil, business.timezone);
  const message = notice.checkoutInProgress
    ? `Novo pagamento em andamento. Seu PROFISSIONAL fica ativo até ${activeUntil}; conclua o pagamento para mantê-lo.`
    : notice.reason === "payment_failed"
      ? `Não conseguimos cobrar a sua assinatura. Atualize a forma de pagamento até ${activeUntil} para manter o PROFISSIONAL.`
      : `Sua assinatura foi cancelada. Seu PROFISSIONAL fica ativo até ${activeUntil}; depois, o negócio volta ao Grátis.`;
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

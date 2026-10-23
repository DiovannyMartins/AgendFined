import { Check, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isProPlan } from "@/lib/plan/plan";
import { getSubscription } from "@/lib/billing/get-subscription";
import { graceEnd } from "@/lib/billing/grace";
import { graceNotice, type GraceNotice } from "@/lib/billing/grace-notice";
import { PLAN_INFO } from "@/lib/billing/plans";
import type { BillingPlan, SubscriptionStatus } from "@/lib/billing/types";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { formatDate } from "@/lib/format/when";
import { RetryUpgradeButton } from "./retry-upgrade-button";
import { UpgradeButton } from "./upgrade-button";
import { CancelSubscriptionButton } from "./cancel-subscription-button";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending: "Checkout não concluído",
  authorized: "Assinatura ativa",
  paused: "Cobrança recusada",
  cancelled: "Assinatura cancelada",
};

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  authorized: { label: "Ativo", variant: "default" },
  paused: { label: "Cobrança recusada", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

// What the carência means for the dono, with the date the PROFISSIONAL ends
// (issue #151). A failed payment asks for a new payment method; it is not a
// cancellation.
function graceMessage(notice: GraceNotice, activeUntil: string): string {
  if (notice.checkoutInProgress) {
    return `Novo pagamento em andamento. Seu PROFISSIONAL fica ativo até ${activeUntil}; se o pagamento não for concluído, o plano volta para Grátis.`;
  }
  if (notice.reason === "payment_failed") {
    return `Não conseguimos cobrar a sua assinatura. Atualize a forma de pagamento até ${activeUntil} para manter o PROFISSIONAL.`;
  }
  return `Seu PROFISSIONAL fica ativo até ${activeUntil}. Depois, o negócio volta ao Grátis, sem perder dados.`;
}

export async function PlanSection({
  business,
}: {
  business: { id: string; plan: BillingPlan; timezone?: string };
}) {
  const result = await getSubscription(business);
  const { plan, subscription } = result;
  const timezone = business.timezone ?? APP_TIMEZONE;
  const now = new Date();
  const info = PLAN_INFO[plan];
  const proInfo = PLAN_INFO.pro;
  const isPro = isProPlan(plan);
  const status = subscription?.status ?? null;
  const pendingGrace = status === "pending" ? result.graceSubscription : null;
  // Re-subscribe during the grace window: the latest row is `pending` (new
  // checkout) while an older `paused`/`cancelled` row still grants Pro. Show
  // the grace — not the pending checkout — as the subscription status, so a
  // "pending" business never looks like it got Pro for free.
  const pendingDuringGrace = pendingGrace !== null;
  const displayStatus = pendingGrace ? pendingGrace.status : status;
  const showSubscriptionStatus = isPro || status !== "pending";
  const notice = graceNotice(result, now);
  const nextCharge =
    subscription?.status === "authorized" && subscription.currentPeriodEnd
      ? formatDate(subscription.currentPeriodEnd, timezone)
      : null;
  // Preview for the cancel dialog. The action reads the paid period from the
  // Mercado Pago before cancelling (ADR 0008); without a local next charge
  // date, only the 7-day minimum is known here.
  const paidPeriodKnown =
    !!subscription?.currentPeriodEnd && Date.parse(subscription.currentPeriodEnd) > now.getTime();
  const cancelActiveUntil =
    subscription?.status === "authorized"
      ? {
          date: formatDate(
            graceEnd({ now, paidPeriodEnd: paidPeriodKnown ? subscription.currentPeriodEnd : null }),
            timezone,
          ),
          atLeast: !paidPeriodKnown,
        }
      : null;

  const badge = isPro
    ? displayStatus
      ? STATUS_BADGE[displayStatus]
      : { label: "Ativo", variant: "default" as const }
    : { label: "Atual", variant: "secondary" as const };
  // The business remains Free until the pending checkout is authorized, so
  // keep the Pro offer visible even while the owner is completing payment.
  const showProOffer = !isPro;

  return (
    <section id="plano">
      <h2 className="text-2xl font-semibold tracking-tight">Plano</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Seu plano atual, os privilégios incluídos e o status da assinatura.
      </p>
      <div className={showProOffer ? "mt-6 grid items-start gap-5 lg:grid-cols-2" : "mt-6"}>
        <div className="h-fit self-start rounded-xl border border-border bg-card/30 p-6 transition-colors hover:border-foreground/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Crown className="size-4 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold">{info.name}</p>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <div className="mt-2">
                  <p className="text-xl font-semibold tracking-tight">
                    {info.price}<span className="ml-1 text-xs font-normal text-muted-foreground">{info.period}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
                </div>
              </div>
            </div>
          </div>

          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {info.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm">
                <Check className="size-4 shrink-0 text-primary" />
                {feature}
              </li>
            ))}
          </ul>

          {showSubscriptionStatus && (
            <>
              <p className="mt-4 text-sm text-muted-foreground">
                Status da assinatura:{" "}
                <span className="font-medium text-foreground">
                  {displayStatus ? STATUS_LABEL[displayStatus] : "Sem assinatura"}
                </span>
              </p>
              {notice && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {graceMessage(notice, formatDate(notice.activeUntil, timezone))}
                </p>
              )}
              {nextCharge && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Próxima cobrança em <span className="font-medium text-foreground">{nextCharge}</span>.
                </p>
              )}

              {!pendingDuringGrace && status === "pending" && (
                <p className="mt-1 text-sm text-muted-foreground">
                  O link de pagamento foi criado, mas a assinatura ainda não foi autorizada. Clique abaixo para abrir um novo checkout.
                </p>
              )}
            </>
          )}
          {status === "pending" && !showProOffer && (
            <div className="border-t border-border pt-4">
              <RetryUpgradeButton />
            </div>
          )}

          {isPro && subscription?.status === "paused" && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Você vai abrir um novo checkout no Mercado Pago para cadastrar outro cartão.
              </p>
              <UpgradeButton label="Atualizar forma de pagamento" />
            </div>
          )}

          {isPro && subscription?.status === "cancelled" && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Mudou de ideia? Reative a assinatura para continuar no plano PROFISSIONAL.
              </p>
              <UpgradeButton label="Assinar novamente" />
            </div>
          )}

          {cancelActiveUntil && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                A assinatura é recorrente mensal. Ao cancelar, novas cobranças são interrompidas conforme o processamento do Mercado Pago; os recursos PROFISSIONAL permanecem disponíveis até o fim do mês já pago, e por no mínimo 7 dias, e depois o negócio volta ao Grátis.
              </p>
              <CancelSubscriptionButton activeUntil={cancelActiveUntil} />
            </div>
          )}
        </div>

        {showProOffer && (
          <div className="h-fit self-start rounded-xl border border-primary/40 bg-primary/[0.04] p-6 transition-colors hover:border-primary/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold">{proInfo.name}</p>
                </div>
                <div className="mt-2">
                  <p className="text-xl font-semibold tracking-tight">
                    {proInfo.price}<span className="ml-1 text-xs font-normal text-muted-foreground">{proInfo.period}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{proInfo.description}</p>
                </div>
              </div>
              <Crown className="size-5 text-primary" />
            </div>

            <ul className="mt-5 grid gap-2.5">
              {proInfo.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-primary/20 pt-4">
              <p className="text-sm text-muted-foreground">
                {status === "pending"
                  ? "Conclua o pagamento para ativar o PROFISSIONAL e desbloquear mais controle e automação."
                  : "Assine o PROFISSIONAL para desbloquear mais controle e automação para o seu negócio."}
              </p>
              {status === "pending" ? (
                <RetryUpgradeButton label="Fazer upgrade" />
              ) : (
                <UpgradeButton label="Assinar PROFISSIONAL" />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

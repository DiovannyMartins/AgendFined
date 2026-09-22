import { Check, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isProPlan } from "@/lib/plan/plan";
import { getSubscription } from "@/lib/billing/get-subscription";
import { PLAN_INFO } from "@/lib/billing/plans";
import { isSubscriptionInGrace, type BillingPlan, type SubscriptionStatus } from "@/lib/billing/types";
import { GraceCountdown } from "./grace-countdown";
import { RetryUpgradeButton } from "./retry-upgrade-button";
import { UpgradeButton } from "./upgrade-button";
import { CancelSubscriptionButton } from "./cancel-subscription-button";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending: "Checkout não concluído",
  authorized: "Assinatura ativa",
  paused: "Assinatura pausada",
  cancelled: "Assinatura cancelada",
};

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  authorized: { label: "Ativo", variant: "default" },
  paused: { label: "Pausado", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

export async function PlanSection({ business }: { business: { id: string; plan: BillingPlan } }) {
  const { plan, subscription, graceSubscription } = await getSubscription(business);
  const info = PLAN_INFO[plan];
  const proInfo = PLAN_INFO.pro;
  const isPro = isProPlan(plan);
  const status = subscription?.status ?? null;
  const pendingGrace = status === "pending" ? graceSubscription : null;
  // Re-subscribe during the grace window: the latest row is `pending` (new
  // checkout) while an older `paused`/`cancelled` row still grants Pro. Show
  // the grace — not the pending checkout — as the subscription status, so a
  // "pending" business never looks like it got Pro for free.
  const pendingDuringGrace = pendingGrace !== null;
  const displayStatus = pendingGrace ? pendingGrace.status : status;
  const showSubscriptionStatus = isPro || status !== "pending";
  // Live countdown target: the pending checkout hides the grace row, so use
  // the older grace row; otherwise use the current row's own grace.
  const graceEnd =
    pendingGrace?.gracePeriodEnd
      ? pendingGrace.gracePeriodEnd
      : isSubscriptionInGrace(status) && subscription?.gracePeriodEnd
        ? subscription.gracePeriodEnd
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
      <h2 className="text-xl font-semibold">Plano</h2>
      <p className="mt-1 text-muted-foreground">
        Seu plano atual, os privilégios incluídos e o status da assinatura.
      </p>
      <div className={showProOffer ? "mt-5 grid items-start gap-4 lg:grid-cols-2" : "mt-5"}>
        <div className="h-fit self-start rounded-2xl border border-border/80 bg-card/50 p-5 shadow-sm transition-colors hover:border-foreground/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Crown className="size-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold">{info.name}</p>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {info.price}
                  {info.period} · {info.description}
                </p>
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
              {pendingDuringGrace && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Novo pagamento em andamento. Você mantém o PROFISSIONAL até o fim da carência
                  {graceEnd && (
                    <>
                      {" ("}
                      <GraceCountdown gracePeriodEnd={graceEnd} />
                      {")"}
                    </>
                  )}
                  ; se o pagamento não for concluído, o plano volta para Grátis.
                </p>
              )}
              {!pendingDuringGrace && graceEnd && (
                <p className="mt-1 text-sm text-muted-foreground">
                  <GraceCountdown gracePeriodEnd={graceEnd} />
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

          {isPro && isSubscriptionInGrace(subscription?.status) && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Mudou de ideia? Reative a assinatura para continuar no plano PROFISSIONAL.
              </p>
              <UpgradeButton label="Assinar novamente" />
            </div>
          )}

          {subscription?.status === "authorized" && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Quer parar de ser cobrado? Cancelar encerra a assinatura e, após a carência, devolve o negócio ao plano Grátis.
              </p>
              <CancelSubscriptionButton />
            </div>
          )}
        </div>

        {showProOffer && (
          <div className="h-fit self-start rounded-2xl border border-primary/40 bg-primary/[0.04] p-5 shadow-sm shadow-primary/10 transition-colors hover:border-primary/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold">{proInfo.name}</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {`${proInfo.price}${proInfo.period}`} · {proInfo.description}
                </p>
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

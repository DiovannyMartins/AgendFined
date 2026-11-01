import { Check, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSubscription } from "@/lib/billing/get-subscription";
import { graceEnd } from "@/lib/billing/grace";
import { graceNotice, type GraceNotice } from "@/lib/billing/grace-notice";
import { AGENDFINED_PLAN_INFO } from "@/lib/plan/catalog";
import { parseTrialEndsAt } from "@/lib/plan/trial";
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

type BadgeView = { label: string; variant: "default" | "secondary" | "destructive" };

// What the carência means for the dono, with the date the access ends (issue
// #151, ADR 0008). A failed payment asks for a new payment method; it is not a
// cancellation. After the carência the negócio is suspended (ADR 0013).
function graceMessage(notice: GraceNotice, activeUntil: string): string {
  if (notice.checkoutInProgress) {
    return `Novo pagamento em andamento. Seu acesso continua até ${activeUntil}; se o pagamento não for concluído, o negócio fica suspenso.`;
  }
  if (notice.reason === "payment_failed") {
    return `Não conseguimos cobrar a sua assinatura. Atualize a forma de pagamento até ${activeUntil} para não suspender o negócio.`;
  }
  return `Seu acesso continua até ${activeUntil}. Depois, o negócio fica suspenso, sem perder dados.`;
}

// The "Plano" section of Configurações (ADR 0013): one plan, the Plano
// AgendFined, and the state of the negócio in it: teste grátis, assinatura (and
// its carência) or suspenso. Access itself comes from business_has_access();
// this section only explains it and offers the next step.
export async function PlanSection({
  business,
}: {
  business: {
    id: string;
    plan: BillingPlan;
    timezone?: string;
    currentSubscriptionId?: string | null;
    hasAccess: boolean;
    trialEndsAt: string | null;
  };
}) {
  const result = await getSubscription(business);
  const { subscription } = result;
  const timezone = business.timezone ?? APP_TIMEZONE;
  const now = new Date();
  const info = AGENDFINED_PLAN_INFO;
  const status = subscription?.status ?? null;
  const notice = graceNotice(result, now);
  const authorized = status === "authorized";
  // A finite teste still running. "infinity" (a negócio older than the plano
  // único, until the virada) and null are not a teste to show.
  const trialEnd = parseTrialEndsAt(business.trialEndsAt);
  const inTrial = !authorized && !!trialEnd && trialEnd.getTime() > now.getTime();
  const suspended = !business.hasAccess;
  // Born without a teste because its telefone or e-mail already had one, and
  // never subscribed: the dono must know why there is no teste.
  const trialAlreadyUsed = suspended && business.trialEndsAt === null && !business.currentSubscriptionId;

  const nextCharge =
    authorized && subscription?.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd, timezone) : null;
  // Preview for the cancel dialog. The action reads the paid period from the
  // Mercado Pago before cancelling (ADR 0008); without a local next charge
  // date, only the 7-day minimum is known here.
  const paidPeriodKnown =
    !!subscription?.currentPeriodEnd && Date.parse(subscription.currentPeriodEnd) > now.getTime();
  const cancelActiveUntil = authorized
    ? {
        date: formatDate(
          graceEnd({ now, paidPeriodEnd: paidPeriodKnown ? subscription?.currentPeriodEnd : null }),
          timezone,
        ),
        atLeast: !paidPeriodKnown,
      }
    : null;

  const badge: BadgeView = suspended
    ? { label: "Suspenso", variant: "destructive" }
    : authorized
      ? { label: "Ativo", variant: "default" }
      : notice
        ? { label: notice.reason === "payment_failed" ? "Cobrança recusada" : "Cancelado", variant: "destructive" }
        : inTrial
          ? { label: "Teste grátis", variant: "secondary" }
          : { label: "Ativo", variant: "secondary" };

  // How the dono subscribes from here: a pending checkout is resumed, a
  // stopped assinatura gets a new one, and without any the plan is offered.
  const subscribeAction =
    authorized ? null : status === "pending" ? (
      <RetryUpgradeButton />
    ) : status === "paused" && notice ? (
      <UpgradeButton label="Atualizar forma de pagamento" />
    ) : status === "cancelled" && notice ? (
      <UpgradeButton label="Assinar novamente" />
    ) : (
      <UpgradeButton label="Assinar" />
    );

  return (
    <section id="plano">
      <h2 className="text-2xl font-semibold tracking-tight">Plano</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Seu plano, os recursos incluídos e o status da assinatura.
      </p>
      <div className="mt-6 h-fit rounded-xl border border-border bg-card/30 p-6 transition-colors hover:border-foreground/20">
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

        <div className="mt-4 space-y-1 text-sm text-muted-foreground">
          {suspended ? (
            <>
              <p className="font-medium text-foreground">Seu negócio está suspenso.</p>
              {trialAlreadyUsed && <p>Este telefone ou e-mail já usou o teste grátis.</p>}
              <p>
                Seus dados continuam guardados e você ainda pode ver as reservas e cancelá-las. Assine para voltar a
                receber reservas e usar todos os recursos.
              </p>
            </>
          ) : inTrial ? (
            <p>
              Teste grátis até <span className="font-medium text-foreground">{formatDate(trialEnd.toISOString(), timezone)}</span>.
              Assine para continuar depois dele.
            </p>
          ) : (
            <p>
              Status da assinatura:{" "}
              <span className="font-medium text-foreground">{status ? STATUS_LABEL[status] : "Sem assinatura"}</span>
            </p>
          )}
          {notice && <p>{graceMessage(notice, formatDate(notice.activeUntil, timezone))}</p>}
          {nextCharge && (
            <p>
              Próxima cobrança em <span className="font-medium text-foreground">{nextCharge}</span>.
            </p>
          )}
          {status === "pending" && !notice && (
            <p>O link de pagamento foi criado, mas a assinatura ainda não foi autorizada. Conclua o pagamento abaixo.</p>
          )}
        </div>

        {subscribeAction && <div className="mt-4 border-t border-border pt-4">{subscribeAction}</div>}

        {cancelActiveUntil && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              A assinatura é recorrente mensal. Ao cancelar, novas cobranças são interrompidas conforme o processamento do Mercado Pago; o acesso continua até o fim do mês já pago, e por no mínimo 7 dias, e depois o negócio fica suspenso, sem perder dados.
            </p>
            <CancelSubscriptionButton activeUntil={cancelActiveUntil} />
          </div>
        )}
      </div>
    </section>
  );
}

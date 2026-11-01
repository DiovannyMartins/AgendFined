import Link from "next/link";
import { Clock, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSubscription } from "@/lib/billing/get-subscription";
import type { BillingPlan } from "@/lib/billing/types";
import { TRIAL_HIGHLIGHT_DAYS, trialBannerMessage, trialDaysLeft } from "@/lib/plan/trial";
import { cn } from "@/lib/utils";

const PLAN_HREF = "/dashboard/configuracoes#plano";

export type AccessBannerBusiness = {
  id: string;
  plan: BillingPlan;
  currentSubscriptionId?: string | null;
  hasAccess: boolean;
  trialEndsAt: string | null;
};

// Painel-wide state of the negócio in the Plano AgendFined (ADR 0013): the
// suspension, with what still works, or the days left of the teste grátis.
// Nothing for a negócio with an assinatura ativa, nor for one older than the
// plano único ("infinity" until the virada) or without a teste.
export async function AccessBanner({ business }: { business: AccessBannerBusiness }) {
  if (!business.hasAccess) {
    // Born without a teste because its telefone or e-mail already had one,
    // and never subscribed.
    const trialAlreadyUsed = business.trialEndsAt === null && !business.currentSubscriptionId;
    return <SuspendedBanner trialAlreadyUsed={trialAlreadyUsed} />;
  }

  const daysLeft = trialDaysLeft(business.trialEndsAt);
  if (daysLeft === null) return null;
  // Whoever subscribed during the teste is not asked to subscribe again. A
  // failed read shows the banner: it only links to the "Plano" section.
  if (business.currentSubscriptionId) {
    try {
      const { subscription } = await getSubscription(business);
      if (subscription?.status === "authorized") return null;
    } catch {
      // Fall through to the banner.
    }
  }
  return <TrialBanner daysLeft={daysLeft} />;
}

export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const highlight = daysLeft <= TRIAL_HIGHLIGHT_DAYS;
  return (
    <div
      role="status"
      className={cn(
        "mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        highlight ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-card/30",
      )}
    >
      <p className={cn("flex items-start gap-2 text-sm", highlight && "font-medium")}>
        <Clock className={cn("mt-0.5 size-4 shrink-0", highlight ? "text-amber-600" : "text-primary")} aria-hidden />
        {trialBannerMessage(daysLeft)}
      </p>
      <Link
        href={PLAN_HREF}
        className={cn(buttonVariants({ variant: highlight ? "default" : "outline", size: "sm" }), "shrink-0")}
      >
        Assinar
      </Link>
    </div>
  );
}

export function SuspendedBanner({ trialAlreadyUsed }: { trialAlreadyUsed: boolean }) {
  return (
    <div
      role="alert"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">Seu negócio está suspenso.</p>
          {trialAlreadyUsed && <p>Este telefone ou e-mail já usou o teste grátis.</p>}
          <p className="text-muted-foreground">
            A página pública não aceita reservas. Você ainda pode ver reservas, clientes e histórico, cancelar reservas
            e gerenciar sua conta. Assine para voltar a usar tudo, sem perder nada.
          </p>
        </div>
      </div>
      <Link href={PLAN_HREF} className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
        Assinar
      </Link>
    </div>
  );
}

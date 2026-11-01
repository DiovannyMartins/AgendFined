"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { getPlanOfferState, retryUpgrade, startUpgrade } from "@/lib/billing/actions";
import { navigateToCheckout } from "@/lib/billing/checkout-navigation";
import { planOffer, type PlanOfferState } from "@/lib/plan/offer";
import { useIsAuthenticated } from "@/components/use-is-authenticated";

const ctaClassName =
  "relative inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-background px-5 text-sm font-medium text-foreground transition-all hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

type MarketingPlanCtaProps = {
  isAuthenticated?: boolean;
  // Skips the server lookup of the negócio (tests).
  offerState?: PlanOfferState;
};

// The marketing page is static, so the signed-in dono's offer is resolved on
// the client: anonymous first, then the state of their negócio.
function useOfferState(isAuthenticated: boolean, override?: PlanOfferState): PlanOfferState | null {
  const [state, setState] = useState<PlanOfferState | null>(null);

  useEffect(() => {
    if (override || !isAuthenticated) return;
    let active = true;
    void getPlanOfferState()
      .then((value) => {
        if (active) setState(value);
      })
      // Unknown state: the generic checkout still works for every non-subscriber.
      .catch(() => {
        if (active) setState("active");
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, override]);

  if (override) return override;
  if (!isAuthenticated) return "anonymous";
  return state;
}

export function MarketingPlanCta({ isAuthenticated: isAuthenticatedOverride, offerState }: MarketingPlanCtaProps) {
  const isAuthenticated = useIsAuthenticated(isAuthenticatedOverride);
  const state = useOfferState(isAuthenticated, offerState);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Signed in, negócio not read yet.
  const offer = planOffer(state ?? "active");
  const loading = state === null;

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const initialResult = await startUpgrade();
        const result =
          !initialResult.ok && initialResult.code === "UPGRADE_PENDING"
            ? await retryUpgrade()
            : initialResult;
        if (result.ok) {
          navigateToCheckout(result.initPoint);
        } else {
          setError(result.message);
        }
      } catch {
        setError("Não foi possível iniciar o checkout. Tente novamente.");
      }
    });
  }

  return (
    <div className="relative mt-7 space-y-3">
      {offer.kind === "link" ? (
        <Link href={offer.href} className={ctaClassName}>
          {offer.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      ) : (
        <button type="button" className={ctaClassName} onClick={onClick} disabled={pending || loading}>
          {pending ? "Redirecionando..." : offer.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </button>
      )}
      {error && (
        <p role="alert" aria-label={error} className="text-center text-xs text-destructive">
          {error}
        </p>
      )}
      <p
        className="flex items-center justify-center gap-2 text-center text-[11px] text-primary-foreground/70"
        aria-busy={loading}
      >
        <ShieldCheck className="size-3.5 shrink-0" />
        {loading ? "Carregando seu plano..." : offer.note}
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";
import { startUpgrade } from "@/lib/billing/actions";

const ctaClassName =
  "relative mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-background px-5 text-sm font-medium text-foreground transition-all hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

type MarketingPlanCtaProps = {
  isAuthenticated?: boolean;
  label: string;
};

export function MarketingPlanCta({
  isAuthenticated = false,
  label,
}: MarketingPlanCtaProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <Link href="/cadastro" className={ctaClassName}>
        {label}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </Link>
    );
  }

  function onClick() {
    setError(null);
    const checkoutWindow = window.open("", "_blank");
    if (!checkoutWindow) {
      setError("Permita pop-ups para abrir o checkout em uma nova aba.");
      return;
    }

    checkoutWindow.opener = null;
    startTransition(async () => {
      try {
        const result = await startUpgrade();
        if (result.ok) {
          checkoutWindow.location.href = result.initPoint;
        } else {
          checkoutWindow.close();
          setError(result.message);
        }
      } catch {
        checkoutWindow.close();
        setError("Não foi possível iniciar o checkout. Tente novamente.");
      }
    });
  }

  return (
    <div className="mt-7 space-y-2">
      <button
        type="button"
        className={ctaClassName.replace(" mt-7", "")}
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "Redirecionando..." : label}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </button>
      {error && (
        <p
          role="alert"
          aria-label={error}
          className="text-center text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

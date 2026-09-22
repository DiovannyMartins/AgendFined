"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startUpgrade } from "@/lib/billing/actions";

// "Fazer upgrade" CTA for the "Plano" section (ADR 0008). Calls the `startUpgrade`
// server action, which creates a Mercado Pago preapproval and returns its
// `init_point`; the browser opens it in a new tab (sandbox in dev). A failure
// surfaces a message inline instead of navigating away. Also reused as
// "Assinar novamente" during the grace window (US16), since re-subscribing runs
// the same `startUpgrade` action.
export function UpgradeButton({ label = "Fazer upgrade" }: { label?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    const checkoutWindow = window.open("", "_blank");
    if (!checkoutWindow) {
      setError("Permita pop-ups para abrir o checkout em uma nova aba.");
      return;
    }
    checkoutWindow.opener = null;
    startTransition(async () => {
      const result = await startUpgrade();
      if (result.ok) {
        checkoutWindow.location.href = result.initPoint;
      } else {
        checkoutWindow.close();
        setError(result.message);
      }
    });
  }

  return (
    <div className="mt-4 space-y-2">
      <Button type="button" onClick={onClick} disabled={pending}>
        {pending ? "Redirecionando..." : label}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

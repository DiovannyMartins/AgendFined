"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { retryUpgrade } from "@/lib/billing/actions";

// "Concluir pagamento" CTA for the "Plano" section. The checkout `init_point`
// is only returned once by `startUpgrade`, so an abandoned checkout (closed
// tab, unpaid) leaves a `pending` row with no way to pay. This calls the
// `retryUpgrade` server action, which issues a FRESH preapproval for the same
// pending row and returns its `init_point`; the browser is redirected there.
// The returned checkout opens in a new tab. A failure surfaces a message inline
// instead of navigating away.
export function RetryUpgradeButton({ label = "Concluir pagamento" }: { label?: string }) {
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
      const result = await retryUpgrade();
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
        {pending ? "Gerando link..." : label}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

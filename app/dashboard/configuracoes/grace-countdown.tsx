"use client";

import { useEffect, useState } from "react";
import { formatGraceRemaining } from "@/lib/billing/format-remaining";

// Live countdown to the end of the grace window (carência). Ticks every second
// so the owner sees exactly how long Pro is kept. `suppressHydrationWarning`
// avoids a hydration mismatch between the server render and the client's clock.
export function GraceCountdown({ gracePeriodEnd }: { gracePeriodEnd: string }) {
  const target = new Date(gracePeriodEnd).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!Number.isFinite(target)) return null;
  const remaining = formatGraceRemaining(target - now);
  if (remaining === "expirada") return <span>Carência expirada</span>;
  return (
    <span suppressHydrationWarning className="font-medium text-foreground tabular-nums">
      Termina em {remaining}
    </span>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { formatTimezone, formatTimezoneOffset } from "@/lib/format/when";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
// The server cannot know the cliente's fuso: render nothing until hydration.
const serverTimezone = () => null;

// Says which fuso the times on the page are in, but only when the cliente's
// browser is somewhere else: "Horários no fuso de Manaus (UTC−4)." `at` is the
// instant whose offset matters (the reserva's start), defaulting to now.
export function TimezoneNotice({ timezone, at, className }: { timezone: string; at?: string; className?: string }) {
  const viewerTimezone = useSyncExternalStore(subscribe, browserTimezone, serverTimezone);
  if (!viewerTimezone) return null;
  const instant = at ?? new Date();
  if (formatTimezoneOffset(viewerTimezone, instant) === formatTimezoneOffset(timezone, instant)) return null;

  const label = formatTimezone(timezone, instant);
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {label.includes("(") ? `Horários no fuso de ${label}.` : `Horários em ${label}.`}
    </p>
  );
}

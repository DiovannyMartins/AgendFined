"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, CalendarPlus } from "lucide-react";
import { convertWaitlistEntry, notifyWaitlistEntry, type WaitlistActionResult } from "@/lib/waitlist/actions";
import { formatPublicCode } from "@/lib/bookings/public-code";
import type { WaitlistStatus } from "@/lib/waitlist/waitlist";

const INITIAL: WaitlistActionResult = { ok: true };

// Notificar and Converter share one result, so the latest click replaces an old
// message (#152). The state lives here, above the forms, so the conversion
// result outlives the revalidation that re-renders the entrada as converted:
// the private link is shown only now and never stored in clear (ADR 0005).
function runWaitlistAction(prev: WaitlistActionResult, formData: FormData): Promise<WaitlistActionResult> {
  return formData.get("intent") === "convert"
    ? convertWaitlistEntry(prev, formData)
    : notifyWaitlistEntry(prev, formData);
}

export function WaitlistActions({ id, status }: { id: string; status: WaitlistStatus }) {
  const [state, formAction, pending] = useActionState(runWaitlistAction, INITIAL);
  const canAct = status === "pending" || status === "notified";
  if (!canAct && !state.publicCode) return null;

  return (
    <div className="space-y-1" aria-live="polite">
      {canAct && (
        <div className="flex items-center gap-2">
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="notify" />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              <Bell className="size-4" />
              Notificar
            </Button>
          </form>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="convert" />
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              <CalendarPlus className="size-4" />
              Converter em reserva
            </Button>
          </form>
        </div>
      )}
      {state.publicCode && (
        <p className="text-xs text-emerald-600">Reserva criada: {formatPublicCode(state.publicCode)}</p>
      )}
      {state.cancellationUrl && (
        <a className="block text-xs text-primary underline" href={state.cancellationUrl} rel="noreferrer">
          Abrir confirmação privada
        </a>
      )}
      {state.message && (
        <p className={state.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{state.message}</p>
      )}
    </div>
  );
}

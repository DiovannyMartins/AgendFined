"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, CalendarPlus } from "lucide-react";
import { convertWaitlistEntry, notifyWaitlistEntry, type WaitlistActionResult } from "@/lib/waitlist/actions";
import type { WaitlistStatus } from "@/lib/waitlist/waitlist";

const INITIAL: WaitlistActionResult = { ok: true };

export function WaitlistActions({ id, status }: { id: string; status: WaitlistStatus }) {
  const canAct = status === "pending" || status === "notified";
  if (!canAct) return null;

  return (
    <div className="flex items-center gap-2">
      <NotifyForm id={id} />
      <ConvertForm id={id} />
    </div>
  );
}

function NotifyForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(notifyWaitlistEntry, INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <Bell className="size-4" />
        Notificar
      </Button>
      {state.ok === false && <p className="mt-1 text-xs text-destructive">{state.message}</p>}
    </form>
  );
}

function ConvertForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(convertWaitlistEntry, INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        <CalendarPlus className="size-4" />
        Converter em reserva
      </Button>
      {state.publicCode && (
        <p className="mt-1 text-xs text-emerald-600">Reserva criada: {state.publicCode}</p>
      )}
      {state.cancellationUrl && (
        <a
          className="mt-1 block text-xs text-primary underline"
          href={state.cancellationUrl}
          rel="noreferrer"
        >
          Abrir confirmação privada
        </a>
      )}
      {state.ok === false && <p className="mt-1 text-xs text-destructive">{state.message}</p>}
    </form>
  );
}

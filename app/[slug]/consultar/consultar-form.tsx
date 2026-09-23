"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { CopyCode } from "@/components/copy-code";
import { consultBooking } from "@/lib/booking/actions";
import type { ConsultState } from "@/lib/bookings/lookup";
import { APP_TIMEZONE } from "@/lib/app-timezone";

const INITIAL: ConsultState = { status: "idle" };

export function ConsultarForm({ slug }: { slug: string }) {
  // Bumping the key remounts the inner form, resetting both its useActionState
  // (back to idle) and its local code field.
  const [round, setRound] = useState(0);
  return <ConsultarFormInner key={round} slug={slug} onReset={() => setRound((r) => r + 1)} />;
}

function ConsultarFormInner({ slug, onReset }: { slug: string; onReset: () => void }) {
  const [state, formAction, pending] = useActionState(consultBooking, INITIAL);
  const [code, setCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(true);

  if (state.status === "success") {
    const booking = state.booking;
    const dateStr = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: APP_TIMEZONE }).format(
      new Date(booking.startAt),
    );
    const timeStr = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIMEZONE }).format(
      new Date(booking.startAt),
    );

    return (
      <div className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <h2 className="text-xl font-semibold">Reserva encontrada</h2>
        <div className="mt-6 space-y-3 rounded-xl bg-muted/40 p-5 text-left">
          <div className="flex items-center gap-2 font-medium">
            <CalendarClock className="size-5 text-primary" />
            {booking.serviceName}
          </div>
          <p className="text-sm text-muted-foreground">
            {dateStr} · às {timeStr}
          </p>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">{booking.businessName}</p>
            <p className="text-sm text-muted-foreground">
              {booking.businessSlug} · {booking.businessPhone}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <p className="text-xs text-muted-foreground">Guarde o código da sua reserva</p>
          <CopyCode code={code.trim()} />
        </div>
        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-block text-sm font-medium hover:underline"
        >
          ← Consultar outra reserva
        </button>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
      <h2 className="text-xl font-semibold">Consultar reserva</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Informe o código da sua reserva para ver os detalhes.
      </p>
      <form action={formAction} className="mt-6 space-y-4 text-left">
        <input type="hidden" name="slug" value={slug} />
        <div className="space-y-2">
          <Label htmlFor="code">Código da reserva</Label>
          <Input
            id="code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="AB12-CD34"
            required
          />
        </div>
        <TurnstileWidget action="booking_consult" onToken={setTurnstileToken} onState={setTurnstileReady} />
        <input type="hidden" name="cfTurnstileToken" value={turnstileToken} />
        {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
        <Button type="submit" className="w-full" disabled={pending || !turnstileReady}>
          {pending ? "Consultando..." : "Consultar"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href={`/${slug}`} className="font-medium hover:underline">
          ← Fazer uma reserva
        </Link>
      </p>
    </div>
  );
}

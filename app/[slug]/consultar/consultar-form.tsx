"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { CopyCode } from "@/components/copy-code";
import { PublicBookingStatus } from "@/components/public-booking-status";
import { publicCodeHint, publicDocumentTitle } from "@/lib/bookings/public-status";
import { consultBooking } from "@/lib/booking/actions";
import type { ConsultState } from "@/lib/bookings/lookup";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { BusinessPhone } from "@/components/business-contact";
import { TimezoneNotice } from "@/components/timezone-notice";
import { AddToCalendar } from "@/components/add-to-calendar";

const INITIAL: ConsultState = { status: "idle" };

export function ConsultarForm({ slug, timezone }: { slug: string; timezone: string }) {
  // Bumping the key remounts the inner form, resetting both its useActionState
  // (back to idle) and its local code field.
  const [round, setRound] = useState(0);
  return <ConsultarFormInner key={round} slug={slug} timezone={timezone} onReset={() => setRound((r) => r + 1)} />;
}

function ConsultarFormInner({ slug, timezone, onReset }: { slug: string; timezone: string; onReset: () => void }) {
  const [state, formAction, pending] = useActionState(consultBooking, INITIAL);
  const [code, setCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(true);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  // Move focus to the result so screen readers announce it.
  useEffect(() => {
    if (state.status === "success") resultHeading.current?.focus();
  }, [state.status]);

  // The tab title follows the found reserva's status, and reverts when the
  // customer goes back to consult another code.
  const foundStatus = state.status === "success" ? state.booking.status : null;
  useEffect(() => {
    if (!foundStatus) return;
    const previous = document.title;
    document.title = publicDocumentTitle(foundStatus);
    return () => {
      document.title = previous;
    };
  }, [foundStatus]);

  if (state.status === "success") {
    const booking = state.booking;
    const bookingTimezone = booking.timezone ?? timezone ?? APP_TIMEZONE;
    const dateStr = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: bookingTimezone }).format(
      new Date(booking.startAt),
    );
    const timeStr = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: bookingTimezone }).format(
      new Date(booking.startAt),
    );

    return (
      <div className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <PublicBookingStatus status={booking.status} headingRef={resultHeading} />
        <div className="mt-6 space-y-3 rounded-xl bg-muted/40 p-5 text-left">
          <div className="flex items-center gap-2 font-medium">
            <CalendarClock className="size-5 text-primary" />
            {booking.serviceName}
          </div>
          <p className="text-sm text-muted-foreground">
            {dateStr} · às {timeStr}
          </p>
          <TimezoneNotice timezone={bookingTimezone} at={booking.startAt} />
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">{booking.businessName}</p>
            <BusinessPhone phone={booking.businessPhone} />
          </div>
        </div>
        {state.calendar && <AddToCalendar {...state.calendar} />}
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <p className="text-xs text-muted-foreground">{publicCodeHint(booking.status)}</p>
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
      <h1 className="text-xl font-semibold">Consultar reserva</h1>
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
        {state.status === "error" && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
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

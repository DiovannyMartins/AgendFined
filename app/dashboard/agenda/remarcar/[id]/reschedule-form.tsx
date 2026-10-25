"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CalendarClock, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getOwnerRescheduleSlots,
  rescheduleOwnerBooking,
  type OwnerRescheduleResult,
} from "@/lib/bookings/reschedule";
import { formatPublicCode } from "@/lib/bookings/public-code";
import { whatsappHref } from "@/lib/format/phone";
import { formatWhenWithTimezone } from "@/lib/format/when";
import { timezoneLabel } from "@/lib/app-timezone";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

const INITIAL: OwnerRescheduleResult = { ok: true };

type SlotsState = { key: string; available: string[]; failed: boolean };

// Remarcação pelo dono (#194): same horários livres and encaixe as the reserva
// pelo painel, for the reserva's own duration.
export function RescheduleForm({
  bookingId,
  currentDate,
  timezone,
  today,
}: {
  bookingId: string;
  currentDate: string;
  timezone: string;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(rescheduleOwnerBooking, INITIAL);
  const [date, setDate] = useState(currentDate);
  const [startTime, setStartTime] = useState("");
  const [slots, setSlots] = useState<SlotsState | null>(null);
  const [askedEncaixe, setAskedEncaixe] = useState(false);
  if (state.code === "outside_availability" && !askedEncaixe) setAskedEncaixe(true);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    getOwnerRescheduleSlots(bookingId, date)
      .then((result) => {
        if (!cancelled) setSlots({ key: date, available: result.available, failed: Boolean(result.error) });
      })
      .catch(() => {
        if (!cancelled) setSlots({ key: date, available: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, date]);
  const currentSlots = slots && slots.key === date ? slots : null;

  if (state.ok && state.startAt) return <Rescheduled result={state} timezone={timezone} />;

  const errors = state.fieldErrors ?? {};
  const fieldError = (name: string) =>
    errors[name]?.[0] ? (
      <p id={`${name}-error`} className="text-xs text-destructive">
        {errors[name][0]}
      </p>
    ) : null;
  const invalid = (name: string) =>
    errors[name]?.[0] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {};

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Nova data</Label>
          <Input
            id="date"
            name="date"
            type="date"
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
            className="[color-scheme:dark]"
            {...invalid("date")}
          />
          {fieldError("date")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="startTime">Novo horário</Label>
          <Input
            id="startTime"
            name="startTime"
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
            className="[color-scheme:dark]"
            {...invalid("startTime")}
          />
          {fieldError("startTime")}
        </div>
      </div>

      {date && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-xs text-muted-foreground">
            Horários livres nesse dia (fuso {timezoneLabel(timezone)}). Você também pode digitar outro horário.
          </p>
          {!currentSlots ? (
            <p className="text-xs text-muted-foreground">Carregando horários...</p>
          ) : currentSlots.failed ? (
            <p className="text-xs text-muted-foreground">Não foi possível carregar os horários livres.</p>
          ) : currentSlots.available.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum horário livre na sua disponibilidade nesse dia.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {currentSlots.available.map((slot) => (
                <Button
                  key={slot}
                  type="button"
                  size="sm"
                  variant={slot === startTime ? "default" : "outline"}
                  aria-pressed={slot === startTime}
                  onClick={() => setStartTime(slot)}
                >
                  {slot}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {askedEncaixe && (
        <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
          <input type="checkbox" name="encaixe" className="mt-0.5 size-4 accent-primary" />
          <span>
            <span className="font-medium">Encaixe</span>
            <span className="block text-xs text-muted-foreground">
              Remarcar mesmo fora da sua disponibilidade. Bloqueios e outras reservas continuam valendo.
            </span>
          </span>
        </label>
      )}

      {!state.ok && state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        <CalendarClock className="size-4" />
        {pending ? "Remarcando..." : "Remarcar reserva"}
      </Button>
    </form>
  );
}

function Rescheduled({ result, timezone }: { result: OwnerRescheduleResult; timezone: string }) {
  const when = formatWhenWithTimezone(result.startAt ?? "", timezone);
  const whatsapp = result.notifyByWhatsApp && result.customerPhone ? whatsappHref(result.customerPhone) : null;
  const whatsappText = `Olá, ${result.customerName ?? ""}! Sua reserva (código ${formatPublicCode(
    result.publicCode ?? "",
  )}) foi remarcada para ${when}.`;

  return (
    <div className="space-y-4" aria-live="polite">
      <div>
        <p className="text-lg font-semibold">Reserva remarcada para {when}</p>
        {result.message && <p className="mt-2 text-sm">{result.message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {whatsapp && (
          <a
            href={`${whatsapp}?text=${encodeURIComponent(whatsappText)}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <MessageCircle className="size-4" />
            Avisar pelo WhatsApp
          </a>
        )}
        <Link
          href={result.agendaDate ? `/dashboard/agenda?data=${result.agendaDate}` : "/dashboard/agenda"}
          className={buttonVariants({ size: "sm" })}
        >
          Ver na agenda
        </Link>
      </div>
    </div>
  );
}

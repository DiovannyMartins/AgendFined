"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getPublicRescheduleSlots,
  reschedulePublicBooking,
  type PublicRescheduleState,
} from "@/lib/booking/reschedule";
import { toLocalDate } from "@/lib/booking/availability";
import { formatWhenWithTimezone } from "@/lib/format/when";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";
import { SUSPENDED_BOOKING_MESSAGE } from "@/lib/bookings/public-status";

const INITIAL: PublicRescheduleState = { status: "idle" };

type SlotsState = { key: string; available: string[]; failed: boolean; rateLimited: boolean; suspended: boolean };

// Remarcação pelo cliente (#194): the same private capability as the
// cancellation (ADR 0005) moves the reserva to another free horário of the
// public page. The server page is refreshed afterwards, so the date and time
// shown above follow the new horário.
export function RescheduleBooking({
  code,
  token,
  timezone,
  currentStartAt,
}: {
  code: string;
  token: string;
  timezone: string;
  currentStartAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => toLocalDate(new Date(currentStartAt), timezone));
  const [startTime, setStartTime] = useState("");
  const [slots, setSlots] = useState<SlotsState | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: PublicRescheduleState, formData: FormData) => {
    const next = await reschedulePublicBooking(prev, formData);
    if (next.status === "done") {
      setOpen(false);
      router.refresh();
    }
    return next;
  }, INITIAL);

  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    getPublicRescheduleSlots(code, token, date)
      .then((result) => {
        if (!cancelled) {
          setSlots({
            key: date,
            available: result.available,
            failed: Boolean(result.error),
            rateLimited: result.error === "rate_limited",
            suspended: result.error === "suspended",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setSlots({ key: date, available: [], failed: true, rateLimited: false, suspended: false });
      });
    return () => {
      cancelled = true;
    };
  }, [open, code, token, date]);
  const currentSlots = slots && slots.key === date ? slots : null;

  return (
    <div className="w-full">
      {state.status === "done" && (
        <div role="status" className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
          <p className="text-sm font-medium">Reserva remarcada!</p>
          <p className="mt-1 text-sm font-normal text-muted-foreground">
            Novo horário: {formatWhenWithTimezone(state.startAt, timezone)}.
          </p>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button type="button" variant="outline" />}>Remarcar reserva</DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remarcar reserva</DialogTitle>
            <DialogDescription>
              Escolha um novo horário. A reserva continua a mesma, com o mesmo código, e o horário atual é liberado.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitWithoutReset(formAction)} className="space-y-4">
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="startTime" value={startTime} />
            <div className="space-y-2">
              <Label htmlFor="reschedule-date">Nova data</Label>
              <Input
                id="reschedule-date"
                name="date"
                type="date"
                min={toLocalDate(new Date(), timezone)}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setStartTime("");
                }}
                required
              />
            </div>
            <div className="space-y-2" aria-live="polite">
              {!currentSlots ? (
                <p className="text-xs text-muted-foreground">Carregando horários...</p>
              ) : currentSlots.suspended ? (
                <p className="text-xs text-muted-foreground">{SUSPENDED_BOOKING_MESSAGE}</p>
              ) : currentSlots.rateLimited ? (
                <p className="text-xs text-muted-foreground">Muitas consultas. Aguarde alguns minutos e tente de novo.</p>
              ) : currentSlots.failed ? (
                <p className="text-xs text-muted-foreground">Não foi possível carregar os horários.</p>
              ) : currentSlots.available.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum horário livre nesse dia. Escolha outra data.</p>
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
            {state.status === "error" && (
              <p role="alert" className="text-sm text-destructive">
                {state.message}
              </p>
            )}
            <Button type="submit" disabled={pending || !startTime} className="w-full">
              {pending ? "Remarcando..." : "Confirmar novo horário"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

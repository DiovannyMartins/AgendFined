"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { createBooking, joinWaitlist } from "@/lib/booking/actions";
import { getSlotsForDate } from "@/lib/availability/actions";
import { toLocalDate } from "@/lib/booking/availability";
import { cn } from "@/lib/utils";

type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};

export function BookingWidget({
  businessId,
  slug,
  services,
}: {
  businessId: string;
  slug: string;
  services: ServiceOption[];
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(true);
  const [lastAttempt, setLastAttempt] = useState<{ date: string; startTime: string } | null>(null);
  const [waitlistOffered, setWaitlistOffered] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState<string | null>(null);
  const [waitlistBusy, setWaitlistBusy] = useState(false);

  const [isPending, startTransition] = useTransition();

  const service = services.find((s) => s.id === serviceId);

  const minDate = useMemo(() => {
    // Allow today; the server enforces min_notice and the future window, so a
    // same-day calendar date is valid when the business permits it.
    return toLocalDate(new Date());
  }, []);

  function handleServiceChange(value: string) {
    setServiceId(value);
    setSelectedSlot(null);
    setSlots([]);
    resetWaitlist();
  }

  function handleDateChange(value: string) {
    setDate(value);
    setSelectedSlot(null);
    setSlots([]);
    resetWaitlist();
  }

  function resetWaitlist() {
    setLastAttempt(null);
    setWaitlistOffered(false);
    setWaitlistSubmitted(null);
  }

  useEffect(() => {
    if (!serviceId || !date) return;
    let cancelled = false;
    startTransition(() => {
      getSlotsForDate(businessId, serviceId, date).then((res) => {
        if (!cancelled) setSlots(res.available ?? []);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId, date, businessId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) {
      setError("Escolha um horário.");
      return;
    }
    if (!consent) {
      setError("Confirme que você concorda com o tratamento dos dados (LGPD).");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createBooking({
      slug,
      serviceId,
      date,
      startTime: slot,
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
      customerNote: customerNote || undefined,
      cfTurnstileToken: turnstileToken || undefined,
    });
    setSubmitting(false);
    if (result.ok && result.publicCode) {
      router.push(`/${slug}/confirmacao?code=${result.publicCode}`);
    } else if (result.code === "slot_taken") {
      // INC-3: the slot was lost to another reservation — offer the waitlist.
      setError(result.message ?? "Esse horário não está mais disponível.");
      setLastAttempt({ date, startTime: slot });
      setWaitlistOffered(true);
      setWaitlistSubmitted(null);
    } else {
      setError(result.message ?? "Não foi possível concluir a reserva.");
      setSelectedSlot(null);
    }
  }

  async function handleJoinWaitlist() {
    if (!serviceId || !lastAttempt) return;
    setWaitlistBusy(true);
    setError(null);
    const res = await joinWaitlist({
      slug,
      serviceId,
      date: lastAttempt.date,
      startTime: lastAttempt.startTime,
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
      cfTurnstileToken: turnstileToken || undefined,
    });
    setWaitlistBusy(false);
    if (res.ok) {
      setWaitlistOffered(false);
      setWaitlistSubmitted(res.message ?? "Você entrou na lista de espera deste horário.");
      setSelectedSlot(null);
      setSlots([]);
    } else if (res.code === "slot_free") {
      // The slot was freed mid-flow: drop the waitlist offer and refresh the
      // slots so the customer can book it directly.
      setWaitlistOffered(false);
      setError(res.message ?? "Esse horário está livre.");
      setSelectedSlot(null);
      getSlotsForDate(businessId, serviceId, lastAttempt.date).then((r) =>
        setSlots(r.available ?? []),
      );
    } else {
      setError(res.message ?? "Não foi possível entrar na lista de espera.");
    }
  }

  const slot = selectedSlot;

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-background p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="service">Escolha o serviço</Label>
          <select
            id="service"
            value={serviceId}
            onChange={(e) => handleServiceChange(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMinutes} min · R$ {(s.priceCents / 100).toFixed(2).replace(".", ",")}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Escolha a data</Label>
          <Input
            id="date"
            type="date"
            value={date}
            min={minDate}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Horários disponíveis</Label>
          {!date ? (
            <p className="text-sm text-muted-foreground">Selecione uma data para ver os horários.</p>
          ) : isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Carregando...
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum horário disponível nesta data. Escolha outra.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(time);
                    resetWaitlist();
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    slot === time
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/60",
                  )}
                >
                  {time}
                </button>
              ))}
            </div>
          )}
          {slot && service && (
            <p className="text-xs text-muted-foreground">
              Horário selecionado: {date} às {slot} ({service.name})
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customerName">Nome</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerPhone">Telefone / WhatsApp</Label>
            <Input
              id="customerPhone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerEmail">E-mail (opcional)</Label>
            <Input
              id="customerEmail"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customerNote">Observação (opcional)</Label>
          <Input
            id="customerNote"
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            maxLength={500}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {waitlistOffered && (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">Esse horário acabou de ser reservado.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quer entrar na lista de espera? Se alguém cancelar, este horário fica em aberto.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleJoinWaitlist}
              disabled={waitlistBusy}
              className="mt-3 w-full"
            >
              {waitlistBusy ? "Entrando..." : "Entrar na lista de espera"}
            </Button>
          </div>
        )}

        {waitlistSubmitted && (
          <div className="rounded-xl border border-green-600/30 bg-green-50 p-4 text-sm text-green-800">
            {waitlistSubmitted}
          </div>
        )}

        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span>
              Autorizo o tratamento dos meus dados (nome, telefone e, se informado,
              e-mail) para fins de agendamento, conforme a{" "}
              <Link href="/privacidade" className="font-medium text-foreground underline">
                Política de Privacidade
              </Link>{" "}
              e os{" "}
              <Link href="/termos" className="font-medium text-foreground underline">
                Termos de Uso
              </Link>
              .
            </span>
          </label>
        </div>

        <TurnstileWidget onToken={setTurnstileToken} onState={setTurnstileReady} />

        <Button type="submit" className="w-full" disabled={submitting || !slot || !consent || !turnstileReady}>
          {submitting ? "Confirmando..." : "Confirmar reserva"}
        </Button>
      </form>
    </div>
  );
}

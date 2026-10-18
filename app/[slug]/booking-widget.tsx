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
import { formatCurrencyBRL } from "@/lib/format/currency";
import { formatSlotWhen } from "@/lib/format/when";
import { cn } from "@/lib/utils";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { buildPrivateConfirmationPath } from "@/lib/bookings/private-confirmation";

type CustomerField = "customerName" | "customerPhone" | "customerEmail" | "customerNote";
type FieldErrors = Partial<Record<CustomerField, string>>;

// Server errors meaning the chosen slot itself is gone; any other failure keeps
// it so the customer can fix the form and retry. `slot_taken` has its own branch.
const SLOT_GONE_CODES = new Set(["no_availability", "booking_window", "service_not_found"]);
const SLOT_TAKEN_MESSAGE = "Esse horário acabou de ser reservado. Escolha outro.";

type ServiceOption = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
};

export function BookingWidget({
  businessId,
  slug,
  timezone,
  services,
  offersWaitlist,
}: {
  businessId: string;
  slug: string;
  timezone: string;
  services: ServiceOption[];
  // Whether the business can follow up waitlist requests (PROFISSIONAL only).
  // The plan itself never reaches the customer-facing page.
  offersWaitlist: boolean;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(true);
  const [turnstileRound, setTurnstileRound] = useState(0);
  const [lastAttempt, setLastAttempt] = useState<{ date: string; startTime: string } | null>(null);
  const [waitlistOffered, setWaitlistOffered] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState<string | null>(null);
  const [waitlistBusy, setWaitlistBusy] = useState(false);

  const [isPending, startTransition] = useTransition();

  const service = services.find((s) => s.id === serviceId);

  const minDate = useMemo(() => {
    // Allow today; the server enforces min_notice and the future window, so a
    // same-day calendar date is valid when the business permits it.
    return toLocalDate(new Date(), timezone);
  }, [timezone]);

  function handleServiceChange(value: string) {
    setServiceId(value);
    setSelectedSlot(null);
    setSlots([]);
    setAvailabilityError(null);
    resetWaitlist();
  }

  function handleDateChange(value: string) {
    setDate(value);
    setSelectedSlot(null);
    setSlots([]);
    setAvailabilityError(null);
    resetWaitlist();
  }

  function updateCustomerField(field: CustomerField, setValue: (value: string) => void, value: string) {
    setValue(value);
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function fieldErrorProps(field: CustomerField, describedBy?: string) {
    const message = fieldErrors[field];
    const ids = [describedBy, message ? `${field}-error` : undefined].filter(Boolean).join(" ");
    return {
      "aria-invalid": message ? true : undefined,
      "aria-describedby": ids || undefined,
    };
  }

  function resetTurnstile() {
    setTurnstileToken("");
    setTurnstileReady(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
    setTurnstileRound((round) => round + 1);
  }

  function refreshSlots(forDate: string) {
    getSlotsForDate(businessId, serviceId, forDate)
      .then((r) => {
        setSlots(r.available ?? []);
        setAvailabilityError(r.error ? "Não foi possível atualizar os horários." : null);
      })
      .catch(() => setAvailabilityError("Não foi possível atualizar os horários."));
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
        if (cancelled) return;
        setSlots(res.available ?? []);
        setAvailabilityError(
          res.error === "db_error"
            ? "Não foi possível carregar os horários. Tente novamente."
            : res.error === "rate_limited"
              ? "Muitas consultas. Aguarde alguns minutos e tente novamente."
            : res.error === "booking_window"
              ? "Esta data está fora da janela de reservas do negócio. Escolha outra."
            : res.error === "validation"
              ? "Não foi possível consultar esta data. Confira a data escolhida e tente novamente."
            : res.error
              ? "Não foi possível encontrar este serviço ou negócio."
              : null,
        );
      }).catch(() => {
        if (!cancelled) {
          setSlots([]);
          setAvailabilityError("Não foi possível carregar os horários. Tente novamente.");
        }
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
    setFieldErrors({});
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
    if (result.ok && result.publicCode && result.cancelToken) {
      trackAnalyticsEvent("booking_complete", { method: "public_form" });
      router.push(buildPrivateConfirmationPath(slug, result.publicCode, result.cancelToken));
    } else if (result.code === "slot_taken" && offersWaitlist) {
      // INC-3: the slot was lost to another reservation — offer the waitlist.
      setError(result.message ?? "Esse horário não está mais disponível.");
      // The lost slot leaves the list; the offer keeps it in `lastAttempt`.
      setLastAttempt({ date, startTime: slot });
      setWaitlistOffered(true);
      setWaitlistSubmitted(null);
      setSelectedSlot(null);
      refreshSlots(date);
      resetTurnstile();
    } else if (result.code === "slot_taken") {
      // Without a waitlist there is nothing to promise: ask for another slot.
      setError(SLOT_TAKEN_MESSAGE);
      setSelectedSlot(null);
      refreshSlots(date);
      resetTurnstile();
    } else if (result.code === "validation") {
      // Validation runs before the anti-bot gate, so the Turnstile token is
      // still unspent and the slot stays selected while the customer fixes it.
      setError(result.message ?? "Revise os campos destacados.");
      setFieldErrors(firstFieldErrors(result.fieldErrors));
    } else {
      setError(result.message ?? "Não foi possível concluir a reserva.");
      if (result.code && SLOT_GONE_CODES.has(result.code)) setSelectedSlot(null);
      // The server already spent this Turnstile token; a retry needs a new one.
      resetTurnstile();
    }
  }

  async function handleJoinWaitlist() {
    if (!serviceId || !lastAttempt) return;
    setWaitlistBusy(true);
    setError(null);
    setFieldErrors({});
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
    } else if (res.code === "slot_free" || res.code === "waitlist_unavailable") {
      // The slot was freed mid-flow, or the business can no longer take
      // waitlist requests: drop the offer and refresh the slots so the
      // customer can pick one directly.
      setWaitlistOffered(false);
      setError(res.message ?? (res.code === "slot_free" ? "Esse horário está livre." : SLOT_TAKEN_MESSAGE));
      setSelectedSlot(null);
      refreshSlots(lastAttempt.date);
    } else if (res.code === "validation" && res.fieldErrors) {
      // Checked before the anti-bot gate: the token is unspent and the offer stays.
      setError(res.message ?? "Revise os campos destacados.");
      setFieldErrors(firstFieldErrors(res.fieldErrors));
    } else {
      setError(res.message ?? "Não foi possível entrar na lista de espera.");
    }
  }

  const slot = selectedSlot;

  const showSlots = Boolean(date) && !isPending && !availabilityError && slots.length > 0;
  const submitHint = !slot
    ? "Escolha um horário para confirmar."
    : !consent
      ? "Marque a autorização de tratamento dos dados para confirmar."
      : null;

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
                {s.name} · {s.durationMinutes} min · {formatCurrencyBRL(s.priceCents)}
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
            className="[color-scheme:dark]"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm leading-none font-medium">Horários disponíveis</legend>
          {/* One live region announces every change of the slot list; each
              message shows once (the slot count is for screen readers only). */}
          <div aria-live="polite" aria-atomic="true" className="text-sm">
            {!date ? (
              <p className="text-muted-foreground">Selecione uma data para ver os horários.</p>
            ) : isPending ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Spinner className="size-4" aria-hidden="true" /> Carregando horários...
              </p>
            ) : availabilityError ? (
              <p className="text-destructive">{availabilityError}</p>
            ) : slots.length === 0 ? (
              <p className="text-muted-foreground">Nenhum horário disponível nesta data. Escolha outra.</p>
            ) : (
              <p className="sr-only">
                {slots.length} {slots.length === 1 ? "horário disponível" : "horários disponíveis"}.
              </p>
            )}
          </div>
          {showSlots && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((time) => (
                <button
                  key={time}
                  type="button"
                  aria-pressed={slot === time}
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
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {slot && service ? `Horário selecionado: ${formatSlotWhen(date, slot)} (${service.name})` : null}
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customerName">Nome</Label>
            <Input
              id="customerName"
              autoComplete="name"
              value={customerName}
              onChange={(e) => updateCustomerField("customerName", setCustomerName, e.target.value)}
              {...fieldErrorProps("customerName")}
              required
            />
            <FieldError id="customerName-error" message={fieldErrors.customerName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerPhone">Telefone / WhatsApp</Label>
            <Input
              id="customerPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 98888-7777"
              value={customerPhone}
              onChange={(e) => updateCustomerField("customerPhone", setCustomerPhone, e.target.value)}
              {...fieldErrorProps("customerPhone")}
              required
            />
            <FieldError id="customerPhone-error" message={fieldErrors.customerPhone} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerEmail">E-mail para confirmação</Label>
            <Input
              id="customerEmail"
              type="email"
              autoComplete="email"
              value={customerEmail}
              onChange={(e) => updateCustomerField("customerEmail", setCustomerEmail, e.target.value)}
              {...fieldErrorProps("customerEmail", "customerEmail-help")}
              required
            />
            <FieldError id="customerEmail-error" message={fieldErrors.customerEmail} />
            <p id="customerEmail-help" className="text-xs text-muted-foreground">
              Enviaremos os dados da reserva para este endereço.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customerNote">Observação (opcional)</Label>
          <Input
            id="customerNote"
            value={customerNote}
            onChange={(e) => updateCustomerField("customerNote", setCustomerNote, e.target.value)}
            {...fieldErrorProps("customerNote")}
            maxLength={500}
          />
          <FieldError id="customerNote-error" message={fieldErrors.customerNote} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {waitlistOffered && lastAttempt && (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            {/* The lost slot already left the list, so name it here. */}
            <p className="text-sm font-medium">
              O horário de {formatSlotWhen(lastAttempt.date, lastAttempt.startTime)} acabou de ser reservado.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quer entrar na lista de espera? Se alguém cancelar, este horário fica em aberto.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleJoinWaitlist}
              disabled={waitlistBusy || !turnstileReady}
              className="mt-3 w-full"
            >
              {waitlistBusy ? "Entrando..." : "Entrar na lista de espera"}
            </Button>
          </div>
        )}

        {waitlistSubmitted && (
          <div role="status" className="rounded-xl border border-green-600/30 bg-green-50 p-4 text-sm text-green-800">
            {waitlistSubmitted}
          </div>
        )}

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            id="consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-4 shrink-0"
          />
          <label htmlFor="consent">
            Autorizo o tratamento dos meus dados (nome, telefone e e-mail) para fins
            de agendamento, conforme a{" "}
            <Link href="/privacidade" className="font-medium text-foreground underline">
              Política de Privacidade
            </Link>{" "}
            e os{" "}
            <Link href="/termos" className="font-medium text-foreground underline">
              Termos de Uso
            </Link>
            .
          </label>
        </div>

        <TurnstileWidget
          key={turnstileRound}
          action="booking_write"
          onToken={setTurnstileToken}
          onState={setTurnstileReady}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={submitting || !slot || !consent || !turnstileReady}
          aria-describedby={submitHint ? "submit-hint" : undefined}
        >
          {submitting ? "Confirmando..." : "Confirmar reserva"}
        </Button>
        {submitHint && (
          <p id="submit-hint" className="text-center text-xs text-muted-foreground">
            {submitHint}
          </p>
        )}
      </form>
    </div>
  );
}

function firstFieldErrors(fieldErrors: Record<string, string[]> | undefined): FieldErrors {
  const result: FieldErrors = {};
  for (const field of ["customerName", "customerPhone", "customerEmail", "customerNote"] as const) {
    const message = fieldErrors?.[field]?.[0];
    if (message) result[field] = message;
  }
  return result;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CalendarCheck, Copy, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createOwnerBooking, getOwnerSlots, type OwnerBookingResult } from "@/lib/bookings/owner-booking";
import { formatPublicCode } from "@/lib/bookings/public-code";
import { formatServicePrice } from "@/lib/format/currency";
import { formatPhoneBR, whatsappHref } from "@/lib/format/phone";
import { timezoneLabel } from "@/lib/app-timezone";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

const INITIAL: OwnerBookingResult = { ok: true };

type ServiceOption = { id: string; name: string; duration_minutes: number; price_cents: number };

type SlotsState = { key: string; available: string[]; failed: boolean };

export function NewBookingForm({
  services,
  timezone,
  today,
}: {
  services: ServiceOption[];
  timezone: string;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(createOwnerBooking, INITIAL);
  // A new form after "Criar outra reserva": the created result stays in the
  // action state, so the key remounts the form with empty fields.
  const [formKey, setFormKey] = useState(0);
  const [shownFor, setShownFor] = useState<OwnerBookingResult | null>(null);

  if (services.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Cadastre um serviço ativo antes de criar reservas.{" "}
        <Link href="/dashboard/servicos" className="text-primary underline">
          Ir para Serviços
        </Link>
      </p>
    );
  }

  if (state.ok && state.publicCode && shownFor !== state) {
    return (
      <CreatedBooking
        result={state}
        onAnother={() => {
          setShownFor(state);
          setFormKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <BookingFields
      key={formKey}
      services={services}
      timezone={timezone}
      today={today}
      state={shownFor === state ? INITIAL : state}
      pending={pending}
      formAction={formAction}
    />
  );
}

function BookingFields({
  services,
  timezone,
  today,
  state,
  pending,
  formAction,
}: {
  services: ServiceOption[];
  timezone: string;
  today: string;
  state: OwnerBookingResult;
  pending: boolean;
  formAction: (formData: FormData) => void;
}) {
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : "");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [slots, setSlots] = useState<SlotsState | null>(null);
  // Once the server says the horário is outside the disponibilidade, the
  // encaixe choice stays on screen even if the dono changes the horário.
  const [askedEncaixe, setAskedEncaixe] = useState(false);
  if (state.code === "outside_availability" && !askedEncaixe) setAskedEncaixe(true);

  const slotsKey = serviceId && date ? `${serviceId}|${date}` : "";
  useEffect(() => {
    if (!slotsKey) return;
    let cancelled = false;
    const [service, day] = slotsKey.split("|");
    getOwnerSlots(service, day)
      .then((result) => {
        if (!cancelled) setSlots({ key: slotsKey, available: result.available, failed: Boolean(result.error) });
      })
      .catch(() => {
        if (!cancelled) setSlots({ key: slotsKey, available: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [slotsKey]);
  const currentSlots = slots && slots.key === slotsKey ? slots : null;

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
      <div className="space-y-2">
        <Label htmlFor="serviceId">Serviço</Label>
        <select
          id="serviceId"
          name="serviceId"
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3"
          {...invalid("serviceId")}
        >
          <option value="" disabled>
            Escolha um serviço
          </option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · {service.duration_minutes} min · {formatServicePrice(service.price_cents)}
            </option>
          ))}
        </select>
        {fieldError("serviceId")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Data</Label>
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
          <Label htmlFor="startTime">Horário</Label>
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

      {slotsKey && (
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="customerName">Nome do cliente</Label>
          <Input id="customerName" name="customerName" maxLength={100} required autoComplete="off" {...invalid("customerName")} />
          {fieldError("customerName")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerPhone">Telefone</Label>
          <Input
            id="customerPhone"
            name="customerPhone"
            type="tel"
            inputMode="tel"
            maxLength={30}
            required
            autoComplete="off"
            placeholder="(11) 98888-7777"
            {...invalid("customerPhone")}
          />
          {fieldError("customerPhone")}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customerEmail">E-mail (opcional)</Label>
        <Input
          id="customerEmail"
          name="customerEmail"
          type="email"
          maxLength={200}
          autoComplete="off"
          aria-describedby={errors.customerEmail?.[0] ? "customerEmail-error" : "customerEmail-hint"}
          aria-invalid={errors.customerEmail?.[0] ? true : undefined}
        />
        <p id="customerEmail-hint" className="text-xs text-muted-foreground">
          Com e-mail, o cliente recebe a confirmação e o link para cancelar. Sem e-mail, você envia o link pelo WhatsApp.
        </p>
        {fieldError("customerEmail")}
      </div>

      <div className="space-y-2">
        <Label htmlFor="customerNote">Observação (opcional)</Label>
        <Textarea id="customerNote" name="customerNote" rows={2} maxLength={500} {...invalid("customerNote")} />
        {fieldError("customerNote")}
      </div>

      {askedEncaixe && (
        <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
          <input type="checkbox" name="encaixe" className="mt-0.5 size-4 accent-primary" />
          <span>
            <span className="font-medium">Encaixe</span>
            <span className="block text-xs text-muted-foreground">
              Criar a reserva mesmo fora da sua disponibilidade. Bloqueios e outras reservas continuam valendo.
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
        <CalendarCheck className="size-4" />
        {pending ? "Criando..." : "Criar reserva"}
      </Button>
    </form>
  );
}

function CreatedBooking({ result, onAnother }: { result: OwnerBookingResult; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const confirmationUrl = result.confirmationUrl ?? "";
  const whatsapp = result.customerPhone ? whatsappHref(result.customerPhone) : null;
  const whatsappText = `Olá, ${result.customerName ?? ""}! Sua reserva está confirmada (código ${formatPublicCode(
    result.publicCode ?? "",
  )}). Veja os detalhes ou cancele por este link: ${confirmationUrl}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(confirmationUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4" aria-live="polite">
      <div>
        <p className="text-lg font-semibold">Reserva criada: {formatPublicCode(result.publicCode ?? "")}</p>
        <p className="text-sm text-muted-foreground">
          {result.customerName}
          {result.customerPhone ? ` · ${formatPhoneBR(result.customerPhone)}` : ""}
        </p>
        {result.message && <p className="mt-2 text-sm">{result.message}</p>}
      </div>

      {confirmationUrl && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Este link só aparece agora. Com ele o cliente consulta e cancela a reserva.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              <Copy className="size-4" />
              {copied ? "Link copiado!" : "Copiar link da confirmação"}
            </Button>
            {whatsapp && (
              <a
                href={`${whatsapp}?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <MessageCircle className="size-4" />
                Enviar pelo WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={result.agendaDate ? `/dashboard/agenda?data=${result.agendaDate}` : "/dashboard/agenda"}
          className={buttonVariants({ size: "sm" })}
        >
          Ver na agenda
        </Link>
        <Button type="button" variant="ghost" size="sm" onClick={onAnother}>
          Criar outra reserva
        </Button>
      </div>
    </div>
  );
}

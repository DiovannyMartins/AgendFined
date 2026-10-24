"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBusiness, updateBusiness, type ActionResultState } from "@/lib/business/actions";
import {
  SLOT_INTERVAL_OPTIONS,
  businessFormSchema,
  isSlotIntervalOption,
  type BusinessFormValues,
} from "@/lib/validation/schemas";
import { getBookingWindowLimitDays, type Plan } from "@/lib/plan/plan";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { formatPhoneBR } from "@/lib/format/phone";
import { APP_TIMEZONE, TIMEZONE_OPTIONS } from "@/lib/app-timezone";
import { suggestSlug } from "@/lib/business/slug";

const INITIAL: ActionResultState = { ok: true, data: undefined };

const SLOT_INTERVAL_SELECT_OPTIONS = SLOT_INTERVAL_OPTIONS.map((minutes) => ({ value: minutes, label: `${minutes} min` }));

type BusinessField = keyof BusinessFormValues;

// Visual order of the fields, so focus lands on the first invalid one the
// owner would see after a submit rejected by the server.
const FIELD_ORDER: BusinessField[] = [
  "name",
  "slug",
  "phone",
  "description",
  "slotIntervalMinutes",
  "minNoticeMinutes",
  "bookingWindowDays",
  "timezone",
];

type BusinessFormInitial = {
  name: string;
  slug: string;
  phone: string;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  bookingWindowDays: number;
  timezone: string;
  description: string | null;
  plan: Plan;
};

export function BusinessForm({
  initial,
}: {
  initial?: BusinessFormInitial | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionResultState>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  // During setup the slug follows the name until the owner edits it (#149).
  const [slugEdited, setSlugEdited] = useState(false);
  // A new slug changes the link printed on QR Codes and shared around, so the
  // save waits for an explicit confirmation (#149).
  const [slugChangeToConfirm, setSlugChangeToConfirm] = useState<BusinessFormValues | null>(null);
  const slug = typeof initial?.slug === "string" ? initial.slug : "";
  const creating = !slug;
  const plan: Plan = initial?.plan === "pro" ? "pro" : "free";
  const bookingWindowLimitDays = getBookingWindowLimitDays(plan);
  const timezoneOptions = initial?.timezone && !TIMEZONE_OPTIONS.some((option) => option.value === initial.timezone)
    ? [{ value: initial.timezone, label: initial.timezone }, ...TIMEZONE_OPTIONS]
    : TIMEZONE_OPTIONS;
  // An interval saved before the fixed list (#191) stays selected until the owner picks another.
  const currentSlotInterval = initial?.slotIntervalMinutes;
  const slotIntervalOptions = currentSlotInterval !== undefined && !isSlotIntervalOption(currentSlotInterval)
    ? [{ value: currentSlotInterval, label: `${currentSlotInterval} min (atual)` }, ...SLOT_INTERVAL_SELECT_OPTIONS]
    : SLOT_INTERVAL_SELECT_OPTIONS;

  const {
    register,
    handleSubmit,
    control,
    setFocus,
    setValue,
    formState: { errors },
  } = useForm<BusinessFormValues>({
    resolver: zodResolver(businessFormSchema),
    defaultValues: {
      name: String(initial?.name ?? ""),
      slug,
      phone: initial?.phone ? formatPhoneBR(initial.phone) : "",
      slotIntervalMinutes: String(initial?.slotIntervalMinutes ?? 30),
      minNoticeMinutes: Number(initial?.minNoticeMinutes ?? 120),
      bookingWindowDays: Math.min(Number(initial?.bookingWindowDays ?? 60), bookingWindowLimitDays),
      timezone: String(initial?.timezone ?? APP_TIMEZONE),
      description: String(initial?.description ?? ""),
    },
  });

  // The previous slug redirects to the new one and stays reserved for this
  // business (ADR 0007); confirmation links already sent follow it too (#124).
  const watchedSlug = useWatch({ control, name: "slug" });
  const nextSlug = watchedSlug.trim();
  const slugChanged = !creating && nextSlug !== slug;

  function onSubmit(values: BusinessFormValues) {
    if (!creating && values.slug !== slug) {
      setSlugChangeToConfirm(values);
      return;
    }
    save(values);
  }

  function save(values: BusinessFormValues) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", values.name);
      fd.set("slug", values.slug);
      fd.set("phone", values.phone);
      fd.set("slotIntervalMinutes", values.slotIntervalMinutes);
      fd.set("minNoticeMinutes", String(values.minNoticeMinutes));
      fd.set("bookingWindowDays", String(values.bookingWindowDays));
      fd.set("description", values.description ?? "");
      fd.set("timezone", values.timezone);
      const result = await (creating ? createBusiness : updateBusiness)(INITIAL, fd);
      setState(result);
      setSubmitted(true);
      // The server refused the new fuso (reservas futuras): the selector goes
      // back to the saved one instead of showing a value that was not kept (#149).
      if (!result.ok && result.fieldErrors?.timezone?.length && initial?.timezone) {
        setValue("timezone", initial.timezone);
      }
      if (!result.ok) {
        const firstInvalid = FIELD_ORDER.find((field) => result.fieldErrors?.[field]?.length);
        if (firstInvalid) setFocus(firstInvalid);
      }
      if (result.ok && creating) {
        trackAnalyticsEvent("business_created", { method: "dashboard_form" });
        router.push("/dashboard");
      }
    });
  }

  // A submit blocked by client validation never reaches the server, so the
  // previous server result would linger next to fields the owner already fixed.
  function onInvalid() {
    setState(INITIAL);
    setSubmitted(false);
  }

  const fieldErrors = state.ok ? {} : (state.fieldErrors ?? {});

  function fieldError(field: BusinessField) {
    return errors[field]?.message ?? fieldErrors[field]?.[0];
  }

  // Same contract as the public booking flow: the input announces it is
  // invalid and points at its hint (if any) and at the message below it.
  function fieldErrorProps(field: BusinessField, hintId?: string) {
    const invalid = Boolean(fieldError(field));
    const ids = [hintId, invalid ? `${field}-error` : undefined].filter(Boolean).join(" ");
    return {
      "aria-invalid": invalid ? true : undefined,
      "aria-describedby": ids || undefined,
    };
  }

  function renderFieldError(field: BusinessField) {
    const message = fieldError(field);
    return message ? <p id={`${field}-error`} className="text-sm text-destructive">{message}</p> : null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        {/* The settings page has no other title, so the card heading is its
            h1; during setup the page already has one. */}
        <CardTitle className="text-xl">
          {creating ? <h2>Configurações do negócio</h2> : <h1>Configurações do negócio</h1>}
        </CardTitle>
        <CardDescription>
          {slug ? "Atualize os dados do seu negócio." : "Vamos configurar seu perfil público."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do negócio</Label>
              <Input
                id="name"
                {...fieldErrorProps("name")}
                {...register("name", {
                  onChange: (event) => {
                    if (creating && !slugEdited) setValue("slug", suggestSlug(event.target.value));
                  },
                })}
              />
              {renderFieldError("name")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Endereço público (slug)</Label>
              <Input
                id="slug"
                placeholder="minha-barbearia"
                autoComplete="off"
                {...fieldErrorProps("slug", "slug-hint")}
                {...register("slug", { onChange: () => setSlugEdited(true) })}
              />
              <p id="slug-hint" className="text-xs text-muted-foreground">
                Apenas minúsculas, números e hífen. Seu link: agendfined.com.br/{nextSlug.toLowerCase() || "seu-slug"}
              </p>
              {slugChanged && (
                <p role="status" className="text-sm text-amber-400">
                  Ao salvar, o link agendfined.com.br/{slug} passa a redirecionar para
                  agendfined.com.br/{nextSlug || "seu-slug"} e continua reservado para o seu negócio. Os links de
                  confirmação já enviados aos clientes continuam funcionando. Se quiser, atualize o link onde ele
                  foi divulgado (WhatsApp, Instagram, QR Code impresso).
                </p>
              )}
              {renderFieldError("slug")}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 98888-7777" {...fieldErrorProps("phone")} {...register("phone")} />
              {renderFieldError("phone")}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea id="description" rows={3} maxLength={500} {...fieldErrorProps("description")} {...register("description")} />
            {renderFieldError("description")}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="slotIntervalMinutes">Intervalo entre horários</Label>
              <select
                id="slotIntervalMinutes"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3"
                {...fieldErrorProps("slotIntervalMinutes", "slotIntervalMinutes-hint")}
                {...register("slotIntervalMinutes")}
              >
                {slotIntervalOptions.map((option) => (
                  <option key={option.value} value={String(option.value)}>{option.label}</option>
                ))}
              </select>
              <p id="slotIntervalMinutes-hint" className="text-xs text-muted-foreground">De quanto em quanto tempo os horários aparecem na sua página pública.</p>
              {renderFieldError("slotIntervalMinutes")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="minNoticeMinutes">Antecedência (min)</Label>
              <Input
                id="minNoticeMinutes"
                type="number"
                min={0}
                max={10080}
                {...fieldErrorProps("minNoticeMinutes")}
                {...register("minNoticeMinutes", { valueAsNumber: true })}
              />
              {renderFieldError("minNoticeMinutes")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookingWindowDays">Janela de reservas (dias)</Label>
              <Input
                id="bookingWindowDays"
                type="number"
                min={1}
                max={bookingWindowLimitDays}
                {...fieldErrorProps("bookingWindowDays", "bookingWindowDays-hint")}
                {...register("bookingWindowDays", { valueAsNumber: true })}
              />
              <p id="bookingWindowDays-hint" className="text-xs text-muted-foreground">
                Seu plano permite reservas com até {bookingWindowLimitDays} dias de antecedência.
              </p>
              {renderFieldError("bookingWindowDays")}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Fuso horário do negócio</Label>
            <select
              id="timezone"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3"
              {...fieldErrorProps("timezone", "timezone-hint")}
              {...register("timezone")}
            >
              {timezoneOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p id="timezone-hint" className="text-xs text-muted-foreground">
              Os clientes, o painel, os lembretes e o Google Calendar usarão este fuso. A alteração é bloqueada enquanto houver reservas futuras.
            </p>
            {renderFieldError("timezone")}
          </div>

          {state.ok && submitted && !creating && (
            <p className="text-sm text-emerald-600">Alterações salvas com sucesso.</p>
          )}
          {state.ok && submitted && creating && (
            <p className="text-sm text-emerald-600">
              Negócio criado! Redirecionando para o seu painel...
            </p>
          )}
          {!state.ok && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : slug ? "Salvar alterações" : "Criar meu negócio"}
          </Button>
        </form>
        <Dialog
          open={slugChangeToConfirm !== null}
          onOpenChange={(open) => {
            if (!open) setSlugChangeToConfirm(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trocar o endereço público?</DialogTitle>
              <DialogDescription>
                Seu link passa a ser agendfined.com.br/{slugChangeToConfirm?.slug}. O endereço antigo
                (agendfined.com.br/{slug}) redireciona para o novo, mas QR Codes impressos e links
                divulgados no WhatsApp ou no Instagram continuam mostrando o endereço antigo. Atualize-os
                quando puder.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  // Keeping the address means the field and its preview show
                  // the saved slug again, like the fuso after a refusal (#179).
                  setValue("slug", slug, { shouldValidate: true });
                  setSlugChangeToConfirm(null);
                }}
              >
                Manter o endereço atual
              </Button>
              <Button
                onClick={() => {
                  if (slugChangeToConfirm) save(slugChangeToConfirm);
                  setSlugChangeToConfirm(null);
                }}
              >
                Trocar endereço
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

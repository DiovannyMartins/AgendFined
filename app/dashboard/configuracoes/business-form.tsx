"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
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
import { upsertBusiness, type ActionResultState } from "@/lib/business/actions";
import { businessFormSchema, type BusinessFormValues } from "@/lib/validation/schemas";
import { getBookingWindowLimitDays, type Plan } from "@/lib/plan/plan";

const INITIAL: ActionResultState = { ok: true, data: undefined };

export function BusinessForm({
  initial,
}: {
  initial?: Partial<Record<string, unknown>> | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionResultState>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const slug = typeof initial?.slug === "string" ? initial.slug : "";
  const creating = !slug;
  const plan: Plan = initial?.plan === "pro" ? "pro" : "free";
  const bookingWindowLimitDays = getBookingWindowLimitDays(plan);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BusinessFormValues>({
    resolver: zodResolver(businessFormSchema),
    defaultValues: {
      name: String(initial?.name ?? ""),
      slug,
      phone: String(initial?.phone ?? ""),
      slotIntervalMinutes: String(initial?.slotIntervalMinutes ?? 30),
      minNoticeMinutes: Number(initial?.minNoticeMinutes ?? 120),
      bookingWindowDays: Math.min(Number(initial?.bookingWindowDays ?? 60), bookingWindowLimitDays),
      description: String(initial?.description ?? ""),
    },
  });

  function onSubmit(values: BusinessFormValues) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", values.name);
      fd.set("slug", values.slug);
      fd.set("phone", values.phone);
      fd.set("slotIntervalMinutes", values.slotIntervalMinutes);
      fd.set("minNoticeMinutes", String(values.minNoticeMinutes));
      fd.set("bookingWindowDays", String(values.bookingWindowDays));
      fd.set("description", values.description ?? "");
      const result = await upsertBusiness(INITIAL, fd);
      setState(result);
      setSubmitted(true);
      if (result.ok && creating) {
        router.push("/dashboard");
      }
    });
  }

  const fieldErrors = state.ok ? {} : (state.fieldErrors ?? {});

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Configurações do negócio</CardTitle>
        <CardDescription>
          {slug ? "Atualize os dados do seu negócio." : "Vamos configurar seu perfil público."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do negócio</Label>
              <Input id="name" {...register("name")} />
              {(errors.name || fieldErrors.name) && (
                <p className="text-sm text-destructive">
                  {errors.name?.message ?? fieldErrors.name?.[0]}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Endereço público (slug)</Label>
              <Input id="slug" placeholder="minha-barbearia" autoComplete="off" {...register("slug")} />
              <p className="text-xs text-muted-foreground">
                Apenas minúsculas, números e hífen. Seu link: agendfined.app/{slug || "seu-slug"}
              </p>
              {(errors.slug || fieldErrors.slug) && (
                <p className="text-sm text-destructive">
                  {errors.slug?.message ?? fieldErrors.slug?.[0]}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input id="phone" {...register("phone")} />
              {(errors.phone || fieldErrors.phone) && (
                <p className="text-sm text-destructive">
                  {errors.phone?.message ?? fieldErrors.phone?.[0]}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea id="description" rows={3} maxLength={500} {...register("description")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="slotIntervalMinutes">Intervalo (min)</Label>
              <Input
                id="slotIntervalMinutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                {...register("slotIntervalMinutes")}
              />
              <p className="text-xs text-muted-foreground">Informe qualquer valor inteiro entre 1 e 1440 minutos.</p>
              {(errors.slotIntervalMinutes || fieldErrors.slotIntervalMinutes) && (
                <p className="text-sm text-destructive">
                  {errors.slotIntervalMinutes?.message ?? fieldErrors.slotIntervalMinutes?.[0]}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="minNoticeMinutes">Antecedência (min)</Label>
              <Input
                id="minNoticeMinutes"
                type="number"
                min={0}
                max={10080}
                {...register("minNoticeMinutes", { valueAsNumber: true })}
              />
              {(errors.minNoticeMinutes || fieldErrors.minNoticeMinutes) && (
                <p className="text-sm text-destructive">
                  {errors.minNoticeMinutes?.message ?? fieldErrors.minNoticeMinutes?.[0]}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookingWindowDays">Janela de reservas (dias)</Label>
              <Input
                id="bookingWindowDays"
                type="number"
                min={1}
                max={bookingWindowLimitDays}
                {...register("bookingWindowDays", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Seu plano permite reservas com até {bookingWindowLimitDays} dias de antecedência.
              </p>
              {(errors.bookingWindowDays || fieldErrors.bookingWindowDays) && (
                <p className="text-sm text-destructive">
                  {errors.bookingWindowDays?.message ?? fieldErrors.bookingWindowDays?.[0]}
                </p>
              )}
            </div>
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
      </CardContent>
    </Card>
  );
}

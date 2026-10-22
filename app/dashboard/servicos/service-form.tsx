"use client";

import { useId, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPriceInput } from "@/lib/format/currency";
import { createService, updateService, type ActionResult } from "@/lib/services/actions";
import { serviceFormSchema, type ServiceFormValues } from "@/lib/validation/schemas";

const INITIAL: ActionResult = { ok: true, data: undefined };

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
};

export function ServiceForm({ service }: { service?: ServiceRow }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [pending, startTransition] = useTransition();
  const action = service ? updateService : createService;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: service?.name ?? "",
      description: service?.description ?? "",
      durationMinutes: service?.durationMinutes ?? 30,
      price: service ? formatPriceInput(service.priceCents) : "",
    },
  });

  // Errors only the server can tell (a name already in use, a price above the
  // limit) belong next to their field, like the client-side ones.
  const serverErrors = state.ok ? undefined : state.fieldErrors;
  const nameError = errors.name?.message ?? serverErrors?.name?.[0];
  const priceError = errors.price?.message ?? serverErrors?.priceCents?.[0];
  const durationError = errors.durationMinutes?.message ?? serverErrors?.durationMinutes?.[0];

  // Each message is tied to its field so a screen reader announces it on focus
  // (#149); the ids are unique because one page renders several forms.
  const errorId = useId();
  const describedBy = (field: string, error: string | undefined, hintId?: string) =>
    [hintId, error ? `${errorId}-${field}` : undefined].filter(Boolean).join(" ") || undefined;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // O formulário de criação é reutilizado entre aberturas: sem reset, a
    // próxima criação vinha preenchida com os dados do serviço anterior.
    if (next && !service) {
      reset({ name: "", description: "", durationMinutes: 30, price: "" });
      setState(INITIAL);
    }
  }

  function onSubmit(values: ServiceFormValues) {
    startTransition(async () => {
      const fd = new FormData();
      if (service) fd.set("id", service.id);
      fd.set("name", values.name);
      fd.set("description", values.description ?? "");
      fd.set("durationMinutes", String(values.durationMinutes));
      fd.set("price", values.price);
      const result = await action(INITIAL, fd);
      setState(result);
      if (result.ok) setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant={service ? "outline" : "default"} size={service ? "sm" : "default"} />}
      >
        {service ? "Editar" : "Novo serviço"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Criar serviço"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={describedBy("name", nameError)}
              {...register("name")}
            />
            {nameError && <p id={`${errorId}-name`} className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea id="description" rows={3} maxLength={500} {...register("description")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="durationMinutes">Duração (min)</Label>
              <Input
                id="durationMinutes"
                type="number"
                min={5}
                max={480}
                aria-invalid={durationError ? true : undefined}
                aria-describedby={describedBy("durationMinutes", durationError)}
                {...register("durationMinutes", { valueAsNumber: true })}
              />
              {durationError && (
                <p id={`${errorId}-durationMinutes`} className="text-sm text-destructive">{durationError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Preço (R$)</Label>
              <Input
                id="price"
                type="text"
                inputMode="decimal"
                placeholder="49,90"
                aria-describedby={describedBy("price", priceError, "price-hint")}
                aria-invalid={priceError ? true : undefined}
                {...register("price")}
              />
              <p id="price-hint" className="text-xs text-muted-foreground">
                Use vírgula para os centavos, como 49,90 ou 1.234,56.
              </p>
              {priceError && <p id={`${errorId}-price`} className="text-sm text-destructive">{priceError}</p>}
            </div>
          </div>
          {!state.ok && !serverErrors && <p className="text-sm text-destructive">{state.message}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Salvando..." : service ? "Salvar" : "Criar serviço"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

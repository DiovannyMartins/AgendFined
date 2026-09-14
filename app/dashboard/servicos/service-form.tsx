"use client";

import { useState, useTransition } from "react";
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
      price: service ? (service.priceCents / 100).toFixed(2) : "",
    },
  });

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
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
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
                {...register("durationMinutes", { valueAsNumber: true })}
              />
              {errors.durationMinutes && (
                <p className="text-sm text-destructive">{errors.durationMinutes.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Preço (R$)</Label>
              <Input id="price" type="text" inputMode="decimal" placeholder="49.90" {...register("price")} />
              {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
            </div>
          </div>
          {!state.ok && <p className="text-sm text-destructive">{state.message}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Salvando..." : service ? "Salvar" : "Criar serviço"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

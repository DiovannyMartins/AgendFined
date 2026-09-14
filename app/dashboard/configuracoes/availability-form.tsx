"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  setAvailability,
  updateAvailability,
  deleteAvailability,
  type ActionResult,
} from "@/lib/availability/actions";

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "1 - Domingo" },
  { value: 2, label: "2 - Segunda" },
  { value: 3, label: "3 - Terça" },
  { value: 4, label: "4 - Quarta" },
  { value: 5, label: "5 - Quinta" },
  { value: 6, label: "6 - Sexta" },
  { value: 7, label: "7 - Sábado" },
];

const INITIAL = { ok: true } as ActionResult;

const WEEKDAY_ITEMS = Object.fromEntries(WEEKDAYS.map((d) => [String(d.value), d.label]));

export function AvailabilityForm() {
  const [state, formAction, pending] = useActionState(setAvailability, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="weekday">Dia da semana</Label>
          <Select name="weekday" defaultValue="2" items={WEEKDAY_ITEMS}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="startTime">Início</Label>
          <Input id="startTime" name="startTime" type="time" defaultValue="08:00" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">Fim</Label>
          <Input id="endTime" name="endTime" type="time" defaultValue="18:00" required />
        </div>
      </div>
      {!state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Adicionando..." : "Adicionar faixa"}
      </Button>
    </form>
  );
}

export function AvailabilityRow({
  id,
  weekday,
  startTime,
  endTime,
}: {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateAvailability.bind(null, id),
    INITIAL,
  );

  const short = (t: string) => t.slice(0, 5);
  const label = WEEKDAYS.find((d) => d.value === weekday)?.label ?? String(weekday);

  useEffect(() => {
    if (state.ok && state !== INITIAL) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2 text-sm">
        <span>
          {label}: {short(startTime)} – {short(endTime)}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              await deleteAvailability(id);
            }}
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {deleting ? "Removendo..." : "Remover"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-border px-3 py-3"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`weekday-${id}`}>Dia da semana</Label>
          <Select
            name="weekday"
            defaultValue={String(weekday)}
            items={WEEKDAY_ITEMS}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`startTime-${id}`}>Início</Label>
          <Input
            id={`startTime-${id}`}
            name="startTime"
            type="time"
            defaultValue={short(startTime)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`endTime-${id}`}>Fim</Label>
          <Input
            id={`endTime-${id}`}
            name="endTime"
            type="time"
            defaultValue={short(endTime)}
            required
          />
        </div>
      </div>
      {!state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Salvando..." : "Salvar"}
        </Button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

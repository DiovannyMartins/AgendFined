"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export const WEEKDAYS: { value: number; label: string; name: string }[] = [
  { value: 1, label: "1 - Domingo", name: "Domingo" },
  { value: 2, label: "2 - Segunda", name: "Segunda" },
  { value: 3, label: "3 - Terça", name: "Terça" },
  { value: 4, label: "4 - Quarta", name: "Quarta" },
  { value: 5, label: "5 - Quinta", name: "Quinta" },
  { value: 6, label: "6 - Sexta", name: "Sexta" },
  { value: 7, label: "7 - Sábado", name: "Sábado" },
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
            <SelectTrigger id="weekday">
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
          <Input id="startTime" name="startTime" type="time" defaultValue="08:00" required className="[color-scheme:dark]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">Fim</Label>
          <Input id="endTime" name="endTime" type="time" defaultValue="18:00" required className="[color-scheme:dark]" />
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
  const [state, formAction, pending] = useActionState(
    updateAvailability.bind(null, id),
    INITIAL,
  );

  const short = (t: string) => t.slice(0, 5);
  const day = WEEKDAYS.find((d) => d.value === weekday);
  const label = day?.label ?? String(weekday);

  useEffect(() => {
    if (!state.ok || state === INITIAL) return;
    const closeAfterRender = window.setTimeout(() => setEditing(false), 0);
    return () => {
      window.clearTimeout(closeAfterRender);
    };
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
          <AvailabilityDelete
            id={id}
            range={`${day?.name ?? weekday}, ${short(startTime)} – ${short(endTime)}`}
          />
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
            <SelectTrigger id={`weekday-${id}`}>
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
            className="[color-scheme:dark]"
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
            className="[color-scheme:dark]"
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

// Remover uma faixa tira os horários da página pública na hora, então pede
// confirmação como as outras ações destrutivas do painel.
function AvailabilityDelete({ id, range }: { id: string; range: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(INITIAL);
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        Remover
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover faixa</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja remover a faixa {range}? Esses horários deixam de
            aparecer na sua página pública.
          </DialogDescription>
        </DialogHeader>
        {!state.ok && <p className="text-sm text-destructive">{state.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                let result: ActionResult;
                try {
                  result = await deleteAvailability(id);
                } catch {
                  result = {
                    ok: false,
                    code: "UNEXPECTED_ERROR",
                    message: "Não foi possível remover a faixa. Tente novamente.",
                  };
                }
                setState(result);
                if (result.ok) setOpen(false);
              })
            }
          >
            {pending ? "Removendo..." : "Remover faixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

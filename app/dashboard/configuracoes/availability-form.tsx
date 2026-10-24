"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
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
  type AvailabilityChange,
} from "@/lib/availability/actions";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";
import { WEEKDAYS } from "@/lib/availability/weekdays";
import { agendaSearchString } from "@/lib/agenda/view";

const INITIAL = { ok: true } as ActionResult;
const INITIAL_CHANGE = { ok: true } as ActionResult<AvailabilityChange>;

// Reservas left outside the disponibilidade by the last change (#192). The
// notice lives above the list because a removed faixa's row unmounts as soon
// as the page revalidates.
const ChangeContext = createContext<{
  change: AvailabilityChange;
  report: (change: AvailabilityChange) => void;
}>({ change: undefined, report: () => {} });

export function AvailabilityChangeProvider({ children }: { children: ReactNode }) {
  const [change, report] = useState<AvailabilityChange>(undefined);
  return <ChangeContext.Provider value={{ change, report }}>{children}</ChangeContext.Provider>;
}

export function AvailabilityChangeNotice() {
  const { change, report } = useContext(ChangeContext);
  if (!change) return null;
  return (
    <div role="status" className="mt-4 space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p>{change.warning}</p>
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/agenda${agendaSearchString({ dateKey: change.agendaDate, status: "confirmed" })}`}
          className="inline-flex min-h-6 items-center underline"
        >
          Ver na agenda
        </Link>
        <button
          type="button"
          onClick={() => report(undefined)}
          className="inline-flex min-h-6 items-center px-1 text-muted-foreground hover:text-foreground"
        >
          Fechar aviso
        </button>
      </div>
    </div>
  );
}

const WEEKDAY_ITEMS = Object.fromEntries(WEEKDAYS.map((d) => [String(d.value), d.name]));

const DEFAULT_DAYS = [2];
const WEEKDAYS_MON_FRI = [2, 3, 4, 5, 6];

export function AvailabilityForm() {
  const [state, formAction, pending] = useActionState(setAvailability, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  // Vários dias de uma vez: segunda a sexta, 08–18, é um envio só (#149).
  const [days, setDays] = useState<number[]>(DEFAULT_DAYS);
  const { report } = useContext(ChangeContext);

  // Back to the defaults only once the faixa was added; on error the fields
  // keep what was sent (#148).
  useEffect(() => {
    if (!state.ok || state === INITIAL) return;
    formRef.current?.reset();
    // A new faixa may cover what the last notice listed, so it is cleared.
    report(undefined);
    const resetDaysAfterRender = window.setTimeout(() => setDays(DEFAULT_DAYS), 0);
    return () => window.clearTimeout(resetDaysAfterRender);
  }, [state, report]);

  const toggleDay = (value: number, checked: boolean) =>
    setDays((current) =>
      checked ? [...current.filter((d) => d !== value), value] : current.filter((d) => d !== value),
    );

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Dias da semana</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="flex min-h-6 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="weekday"
                value={d.value}
                checked={days.includes(d.value)}
                onChange={(e) => toggleDay(d.value, e.target.checked)}
                className="size-4 shrink-0"
              />
              {d.name}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDays(WEEKDAYS_MON_FRI)}
          className="inline-flex min-h-6 items-center px-1 text-sm text-muted-foreground underline hover:text-foreground"
        >
          Marcar segunda a sexta
        </button>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
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
      <Button type="submit" disabled={pending || days.length === 0} size="sm">
        {pending ? "Adicionando..." : days.length > 1 ? `Adicionar faixa em ${days.length} dias` : "Adicionar faixa"}
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
    INITIAL_CHANGE,
  );
  const { report } = useContext(ChangeContext);

  const short = (t: string) => t.slice(0, 5);
  const day = WEEKDAYS.find((d) => d.value === weekday);
  const label = day?.name ?? String(weekday);

  useEffect(() => {
    if (!state.ok || state === INITIAL_CHANGE) return;
    report(state.data);
    const closeAfterRender = window.setTimeout(() => setEditing(false), 0);
    return () => {
      window.clearTimeout(closeAfterRender);
    };
  }, [state, report]);

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
            className="inline-flex min-h-6 items-center px-1 text-muted-foreground hover:text-foreground"
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
      onSubmit={submitWithoutReset(formAction)}
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
                  {d.name}
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
          className="inline-flex min-h-6 items-center px-1 text-sm text-muted-foreground hover:text-foreground"
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
  const [state, setState] = useState<ActionResult<AvailabilityChange>>(INITIAL_CHANGE);
  const { report } = useContext(ChangeContext);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(INITIAL_CHANGE);
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex min-h-6 items-center px-1 text-muted-foreground hover:text-destructive"
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
                let result: ActionResult<AvailabilityChange>;
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
                if (!result.ok) return;
                report(result.data);
                setOpen(false);
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

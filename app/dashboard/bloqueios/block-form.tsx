"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBlock, deleteBlock, type ActionResult } from "@/lib/availability/actions";
import { APP_TIMEZONE, timezoneLabel } from "@/lib/app-timezone";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

const INITIAL = { ok: true } as ActionResult;

export function BlockForm({ timezone = APP_TIMEZONE }: { timezone?: string }) {
  const [state, formAction, pending] = useActionState(createBlock, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  // Cleared only once the bloqueio exists; on a conflict the fields keep what
  // was sent (#148).
  useEffect(() => {
    if (state.ok && state !== INITIAL) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startAt">Início</Label>
          <Input id="startAt" name="startAt" type="datetime-local" required className="[color-scheme:dark]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endAt">Fim</Label>
          <Input id="endAt" name="endAt" type="datetime-local" required className="[color-scheme:dark]" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">Motivo (opcional)</Label>
        <Input id="reason" name="reason" maxLength={120} placeholder="Férias, pausa, compromisso..." />
        <p className="text-xs text-muted-foreground">Horários no fuso do negócio: {timezoneLabel(timezone)}.</p>
      </div>
      {!state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Criando..." : "Criar bloqueio"}
      </Button>
    </form>
  );
}

export function BlockRow({
  id,
  startAt,
  endAt,
  reason,
  timezone = APP_TIMEZONE,
}: {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  timezone?: string;
}) {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(iso));

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2 text-sm">
      <span className="min-w-0">
        {fmt(startAt)} – {fmt(endAt)}
        {reason && <span className="text-muted-foreground"> · {reason}</span>}
      </span>
      <button
        type="button"
        onClick={() => deleteBlock(id)}
        className="inline-flex min-h-6 shrink-0 items-center px-1 text-muted-foreground hover:text-destructive"
      >
        Remover
      </button>
    </div>
  );
}

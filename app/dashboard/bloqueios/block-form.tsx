"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBlock, deleteBlock, type ActionResult } from "@/lib/availability/actions";
import { APP_TIMEZONE } from "@/lib/app-timezone";

const INITIAL = { ok: true } as ActionResult;

export function BlockForm() {
  const [state, formAction, pending] = useActionState(createBlock, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startAt">Início</Label>
          <Input id="startAt" name="startAt" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endAt">Fim</Label>
          <Input id="endAt" name="endAt" type="datetime-local" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">Motivo (opcional)</Label>
        <Input id="reason" name="reason" maxLength={120} placeholder="Férias, pausa, compromisso..." />
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
}: {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}) {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: APP_TIMEZONE,
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
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        Remover
      </button>
    </div>
  );
}

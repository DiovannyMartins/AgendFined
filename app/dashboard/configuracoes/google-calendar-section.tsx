"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CalendarSync, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { disconnectGoogleCalendar, syncGoogleCalendarNow, type GoogleCalendarActionState } from "@/lib/google-calendar/actions";
import type { GoogleCalendarConnectionStatus } from "@/lib/google-calendar/queries";

const INITIAL: GoogleCalendarActionState = { ok: true };

export function GoogleCalendarSection({ connection, isPro }: { connection: GoogleCalendarConnectionStatus; isPro: boolean }) {
  const [syncState, syncAction, syncPending] = useActionState(syncGoogleCalendarNow, INITIAL);
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(disconnectGoogleCalendar, INITIAL);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarSync className="size-5" /> Google Calendar</CardTitle>
        <CardDescription>
          Sincronização unidirecional: reservas confirmadas do AgendFined aparecem no seu calendário.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isPro ? (
          <p className="text-sm text-muted-foreground">Recurso disponível no plano PROFISSIONAL.</p>
        ) : connection ? (
          <>
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">Conectado a {connection.googleEmail}</p>
              <p className="mt-1 text-muted-foreground">Calendário: {connection.calendarId === "primary" ? "principal" : connection.calendarId}</p>
              {connection.lastSyncAt && <p className="mt-1 text-muted-foreground">Última sincronização: {new Date(connection.lastSyncAt).toLocaleString("pt-BR")}</p>}
              {connection.lastError && <p className="mt-2 text-sm text-destructive">A última sincronização falhou. Tente sincronizar novamente ou reconecte a conta.</p>}
              <p className="mt-2 text-xs text-muted-foreground">Desconectar interrompe novas sincronizações; eventos já criados permanecem no Google Calendar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={syncAction}><Button type="submit" variant="outline" disabled={syncPending}>{syncPending ? "Sincronizando..." : "Sincronizar agora"}</Button></form>
              <form action={disconnectAction}><Button type="submit" variant="ghost" disabled={disconnectPending}><Unplug className="size-4" /> {disconnectPending ? "Desconectando..." : "Desconectar"}</Button></form>
            </div>
            {!syncState.ok && <p className="text-sm text-destructive">{syncState.message}</p>}
            {syncState.ok && syncState.message && <p className="text-sm text-emerald-600">{syncState.message}</p>}
            {!disconnectState.ok && <p className="text-sm text-destructive">{disconnectState.message}</p>}
            {disconnectState.ok && disconnectState.message && <p className="text-sm text-emerald-600">{disconnectState.message}</p>}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Conecte sua conta para criar e atualizar eventos automaticamente. O AgendFined não lê eventos existentes.</p>
            <Button render={<Link href="/api/google-calendar/connect" />}>Conectar Google Calendar</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

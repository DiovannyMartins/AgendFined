"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CalendarSync, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adoptGoogleCalendarTimezone, disconnectGoogleCalendar, syncGoogleCalendarNow, type GoogleCalendarActionState } from "@/lib/google-calendar/actions";
import type { GoogleCalendarConnectionStatus } from "@/lib/google-calendar/queries";
import { googleCalendarCallbackNotice } from "@/lib/google-calendar/callback-status";

const INITIAL: GoogleCalendarActionState = { ok: true };

const NOTICE_CLASS = {
  success: "text-emerald-600",
  info: "text-muted-foreground",
  error: "text-destructive",
} as const;

export function GoogleCalendarSection({ connection, isPro, callbackStatus }: { connection: GoogleCalendarConnectionStatus; isPro: boolean; callbackStatus?: string }) {
  const notice = googleCalendarCallbackNotice(callbackStatus);
  const [syncState, syncAction, syncPending] = useActionState(syncGoogleCalendarNow, INITIAL);
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(disconnectGoogleCalendar, INITIAL);
  const [timezoneState, timezoneAction, timezonePending] = useActionState(adoptGoogleCalendarTimezone, INITIAL);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarSync className="size-5" /> Google Calendar</CardTitle>
        <CardDescription>
          Sincronização unidirecional: reservas confirmadas do AgendFined aparecem no seu calendário.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice && (
          <p role={notice.tone === "error" ? "alert" : "status"} className={`text-sm ${NOTICE_CLASS[notice.tone]}`}>
            {notice.message}
          </p>
        )}
        {!isPro ? (
          <p className="text-sm text-muted-foreground">Recurso disponível no plano PROFISSIONAL.</p>
        ) : connection ? (
          <>
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">Conectado a {connection.googleEmail}</p>
              <p className="mt-1 text-muted-foreground">Calendário: {connection.calendarId === "primary" ? "principal" : connection.calendarId}</p>
              <p className="mt-1 text-muted-foreground">Fuso do negócio: {connection.businessTimezone}</p>
              {connection.calendarTimezone && <p className="mt-1 text-muted-foreground">Fuso do Google Calendar: {connection.calendarTimezone}</p>}
              {connection.timezoneMismatch && (
                <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                  <p>Os fusos são diferentes. O horário real está correto, mas o Google Calendar pode exibir outra hora para você.</p>
                  <form action={timezoneAction} className="mt-2">
                    <Button type="submit" size="sm" variant="outline" disabled={timezonePending}>
                      {timezonePending ? "Atualizando..." : "Usar o fuso do Google Calendar"}
                    </Button>
                  </form>
                  <p className="mt-2 text-xs">Só é permitido alinhar automaticamente quando não há reservas futuras, para não alterar horários já publicados.</p>
                </div>
              )}
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
            {!timezoneState.ok && <p className="text-sm text-destructive">{timezoneState.message}</p>}
            {timezoneState.ok && timezoneState.message && <p className="text-sm text-emerald-600">{timezoneState.message}</p>}
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

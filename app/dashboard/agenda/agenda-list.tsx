"use client";

import { useMemo, useState } from "react";
import { Search, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatusAction } from "./status-action";
import type { AgendaBooking } from "@/lib/agenda/view";
import { statusLabel } from "@/lib/bookings/status";
import { formatPublicCode } from "@/lib/bookings/public-code";
import { APP_TIMEZONE } from "@/lib/app-timezone";

type BookingRow = AgendaBooking;

function formatBookingTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: APP_TIMEZONE,
  }).format(new Date(iso));
}

export function AgendaList({
  bookings,
}: {
  bookings: BookingRow[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) =>
      [
        b.public_code ?? "",
        b.customer_name_snapshot,
        b.customer_phone_snapshot,
        b.service_name_snapshot,
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [bookings, query]);

  return (
    <div className="mt-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <CalendarDays className="size-5 text-primary" /> Todas as reservas
      </h2>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código, nome, telefone ou serviço"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {bookings.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <CalendarDays className="size-8 text-muted-foreground" />
            <CardTitle className="mt-3">Nenhuma reserva ainda</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Compartilhe sua página pública para receber reservas.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma reserva encontrada para “{query}”.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((booking) => {
            const status = statusLabel(booking.status);
            return (
              <div
                key={booking.id}
                className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{booking.service_name_snapshot}</p>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBookingTime(booking.start_at)} · {booking.duration_minutes_snapshot} min
                  </p>
                  <p className="mt-1 text-sm">
                    {booking.customer_name_snapshot} · {booking.customer_phone_snapshot}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Código: {formatPublicCode(booking.public_code ?? "")}
                  </p>
                  {booking.cancel_reason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Motivo: {booking.cancel_reason}
                    </p>
                  )}
                </div>
                <StatusAction id={booking.id} status={booking.status} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

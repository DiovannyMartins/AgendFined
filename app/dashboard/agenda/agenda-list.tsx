"use client";

import { useMemo, useState } from "react";
import { Search, CalendarDays, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { StatusAction } from "./status-action";
import type { AgendaBooking } from "@/lib/agenda/view";
import { bookingStatusLabel } from "@/lib/bookings/status";
import { formatPhoneBR, matchesPhone } from "@/lib/format/phone";
import { formatPublicCode, matchesPublicCode } from "@/lib/bookings/public-code";
import { CANCELLATION_REASON_CATEGORY_LABELS, type CancellationReasonCategory } from "@/lib/bookings/classification";
import { isUpcomingConfirmed } from "@/lib/gcal/export";
import { buildWhatsAppReminderHref } from "@/lib/reminders/whatsapp";

type BookingRow = AgendaBooking;

function formatBookingTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(iso));
}

export function AgendaList({
  bookings,
  timezone,
  businessName = "",
  automaticReminders = false,
  cancelOnly = false,
  filterActive = false,
}: {
  bookings: BookingRow[];
  timezone: string;
  businessName?: string;
  // With access (ADR 0013), the cliente with an e-mail gets the lembrete automático.
  automaticReminders?: boolean;
  // Suspended negócio (ADR 0013): the reservas can only be cancelled.
  cancelOnly?: boolean;
  // True when the date/status filters narrowed `bookings`: an empty list then
  // means "nothing matches", not "no reservations yet".
  filterActive?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(
      (b) =>
        matchesPublicCode(b.public_code ?? "", q) ||
        matchesPhone(b.customer_phone_snapshot, q) ||
        [
          b.customer_name_snapshot,
          b.customer_phone_snapshot,
          b.service_name_snapshot,
        ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [bookings, query]);

  const now = new Date();

  return (
    <div className="mt-2">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight">
        <CalendarDays className="size-5 text-primary" /> Todas as reservas
      </h2>

      <div className="relative mb-4 w-full sm:max-w-sm">
        <span className="pointer-events-none absolute left-0 top-0 flex h-9 items-center pl-3">
          <Search className="size-4 text-muted-foreground" />
        </span>
        <Input
          type="search"
          aria-label="Buscar reservas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código, nome, telefone ou serviço"
          className="h-9 pl-10 leading-none"
          autoComplete="off"
        />
      </div>

      {bookings.length === 0 && filterActive ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma reserva com esse filtro. Ajuste a data ou o status para ver outras reservas.
          </CardContent>
        </Card>
      ) : bookings.length === 0 ? (
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
            const status = bookingStatusLabel(booking.status, booking.cancelled_by);
            const note = booking.customer_note?.trim();
            // #195: o lembrete pelo WhatsApp só faz sentido antes do atendimento.
            const reminderHref = isUpcomingConfirmed(booking, now)
              ? buildWhatsAppReminderHref({
                  customerName: booking.customer_name_snapshot,
                  customerPhone: booking.customer_phone_snapshot,
                  businessName,
                  serviceName: booking.service_name_snapshot,
                  startAt: booking.start_at,
                  timezone,
                  publicCode: booking.public_code,
                })
              : null;
            const withoutEmailReminder =
              automaticReminders && reminderHref !== null && !booking.has_email;
            return (
              <div
                key={booking.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card/30 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{booking.service_name_snapshot}</p>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBookingTime(booking.start_at, timezone)} · {booking.duration_minutes_snapshot} min
                  </p>
                  <p className="mt-1 text-sm">
                    {booking.customer_name_snapshot} · {formatPhoneBR(booking.customer_phone_snapshot)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Código: {formatPublicCode(booking.public_code ?? "")}
                  </p>
                  {booking.rescheduled_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Remarcada em {formatBookingTime(booking.rescheduled_at, timezone)}
                    </p>
                  )}
                  {booking.cancel_reason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Motivo: {booking.cancel_reason}
                      {booking.cancel_reason_category
                        ? ` · ${CANCELLATION_REASON_CATEGORY_LABELS[booking.cancel_reason_category as CancellationReasonCategory] ?? "categoria assistida"}`
                        : ""}
                    </p>
                  )}
                  {note && (
                    <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">Observação:</p>
                      <p className="mt-0.5 whitespace-pre-line break-words">{note}</p>
                    </div>
                  )}
                  {/* Only an atendimento still to happen needs preparing; the
                      text says what to do (#149). */}
                  {booking.customer_note_requires_follow_up && booking.status === "confirmed" && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Leia a observação antes do atendimento.
                    </p>
                  )}
                  {reminderHref && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <a
                        href={reminderHref}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                      >
                        <MessageCircle className="size-4" />
                        Lembrar pelo WhatsApp
                      </a>
                      {withoutEmailReminder && (
                        <span className="text-xs text-muted-foreground">
                          Sem e-mail: não recebe o lembrete automático.
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <StatusAction
                  id={booking.id}
                  status={booking.status}
                  startAt={booking.start_at}
                  cancelOnly={cancelOnly}
                  summary={{
                    customerName: booking.customer_name_snapshot,
                    serviceName: booking.service_name_snapshot,
                    when: formatBookingTime(booking.start_at, timezone),
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

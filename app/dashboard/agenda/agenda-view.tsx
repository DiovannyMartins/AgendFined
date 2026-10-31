"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  agendaSearchString,
  bookingLocalDate,
  filterAgenda,
  shiftDateKey,
  weekDateKeys,
  type AgendaBooking,
} from "@/lib/agenda/view";
import type { BookingStatus } from "@/lib/bookings/transitions";
import { STATUS_LABEL } from "@/lib/bookings/status";
import { toLocalDate } from "@/lib/booking/availability";
import { AgendaList } from "./agenda-list";
import { APP_TIMEZONE } from "@/lib/app-timezone";
type StatusFilter = BookingStatus | "";

const STATUS_ITEMS: Record<string, string> = {
  "": "Todos os status",
  ...Object.fromEntries(Object.entries(STATUS_LABEL).map(([value, { label }]) => [value, label])),
};

const WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function prioritizeConfirmed(bookings: AgendaBooking[]): AgendaBooking[] {
  return [...bookings].sort((a, b) => {
    const statusOrder = Number(b.status === "confirmed") - Number(a.status === "confirmed");
    return statusOrder || new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
  });
}

// The agenda shows one week at a time (#215): `bookings` are only that week's
// reservas, fetched by the server for the week of `initialDate` (today by
// default). Picking another day of the same week is instant; leaving the week
// navigates, so the server fetches the new one.
export function AgendaView({
  bookings,
  timezone,
  businessName = "",
  automaticReminders = false,
  initialDate = null,
  initialStatus = null,
  hasAnyBooking = true,
}: {
  bookings: AgendaBooking[];
  timezone?: string;
  // For the lembrete pelo WhatsApp in the list (#195).
  businessName?: string;
  automaticReminders?: boolean;
  initialDate?: string | null;
  initialStatus?: BookingStatus | null;
  // False for a business with no reserva at all, to show the first-steps hint.
  hasAnyBooking?: boolean;
}) {
  const router = useRouter();
  const businessTimezone = timezone ?? APP_TIMEZONE;
  const todayKey = toLocalDate(new Date(), businessTimezone);
  const [day, setDay] = useState<string>(initialDate ?? todayKey);
  const [status, setStatus] = useState<StatusFilter>(initialStatus ?? "");
  const week = useMemo(() => weekDateKeys(day), [day]);

  // Mirror the filters in the URL so a reload (or a shared link) keeps them.
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const query = agendaSearchString({ dateKey: day, status: status || null });
    if (query !== search) {
      window.history.replaceState(window.history.state, "", `${pathname}${query}${hash}`);
    }
  }, [day, status]);

  function goTo(target: string) {
    if (weekDateKeys(target)[0] === week[0]) {
      setDay(target);
      return;
    }
    router.push(`/dashboard/agenda${agendaSearchString({ dateKey: target, status: status || null })}`);
  }

  // Status applies to the whole week (the day strip counts); the list shows the
  // selected day. Confirmed reservations stay at the top because they still
  // require an operational action from the business.
  const byStatus = useMemo(
    () => filterAgenda(bookings, { tz: businessTimezone, filters: { status: status || null } }),
    [bookings, status, businessTimezone],
  );

  const countByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of byStatus) {
      const key = bookingLocalDate(booking.start_at, businessTimezone);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [byStatus, businessTimezone]);

  const listBookings = useMemo(
    () => prioritizeConfirmed(filterAgenda(byStatus, { tz: businessTimezone, filters: { dateKey: day } })),
    [byStatus, day, businessTimezone],
  );

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <CalendarDays className="size-5 text-primary" /> Agenda
        </h2>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-card/30 p-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1 sm:flex">
            <Button
              size="sm"
              variant="outline"
              aria-label="Semana anterior"
              onClick={() => goTo(shiftDateKey(day, -7))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="date"
              value={day}
              onChange={(e) => {
                if (e.target.value) goTo(e.target.value);
              }}
              className="w-full min-w-0 sm:w-40"
              style={{ colorScheme: "dark" }}
              aria-label="Data"
            />
            <Button
              size="sm"
              variant="outline"
              aria-label="Próxima semana"
              onClick={() => goTo(shiftDateKey(day, 7))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-border bg-card/40"
            aria-pressed={day === todayKey}
            onClick={() => goTo(todayKey)}
          >
            Hoje
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onValueChange={(v) => setStatus((v ?? "") as StatusFilter)} items={STATUS_ITEMS}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos os status</SelectItem>
              {Object.entries(STATUS_LABEL).map(([value, { label }]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div role="group" aria-label="Dias da semana" className="grid grid-cols-7 gap-1">
        {week.map((key, index) => {
          const count = countByDay.get(key) ?? 0;
          const selected = key === day;
          return (
            <Button
              key={key}
              size="sm"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              aria-label={`${WEEKDAY_SHORT[index]} ${key.slice(8)}/${key.slice(5, 7)}: ${count} ${count === 1 ? "reserva" : "reservas"}`}
              className="h-auto flex-col gap-0 px-1 py-1.5"
              onClick={() => setDay(key)}
            >
              <span className="text-xs">{WEEKDAY_SHORT[index]}</span>
              <span className="font-semibold">{key.slice(8)}</span>
              <span className="text-[10px] opacity-80">{count}</span>
            </Button>
          );
        })}
      </div>

      <div className="mt-4">
        <AgendaList
          bookings={listBookings}
          timezone={businessTimezone}
          businessName={businessName}
          automaticReminders={automaticReminders}
          filterActive={hasAnyBooking}
        />
      </div>
    </div>
  );
}

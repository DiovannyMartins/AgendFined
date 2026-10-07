"use client";

import { useMemo, useState } from "react";
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
import { filterAgenda, type AgendaBooking } from "@/lib/agenda/view";
import type { BookingStatus } from "@/lib/bookings/transitions";
import { STATUS_LABEL } from "@/lib/bookings/status";
import { toLocalDate } from "@/lib/booking/availability";
import { AgendaList } from "./agenda-list";
type StatusFilter = BookingStatus | "";

const STATUS_ITEMS: Record<string, string> = {
  "": "Todos os status",
  ...Object.fromEntries(Object.entries(STATUS_LABEL).map(([value, { label }]) => [value, label])),
};

function shiftDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function prioritizeConfirmed(bookings: AgendaBooking[]): AgendaBooking[] {
  return [...bookings].sort((a, b) => {
    const statusOrder = Number(b.status === "confirmed") - Number(a.status === "confirmed");
    return statusOrder || new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
  });
}

export function AgendaView({
  bookings,
}: {
  bookings: AgendaBooking[];
}) {
  // The date is an optional filter. `null` means "all dates", so the list
  // ("Todas as reservas") shows every reservation until a date is picked.
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("");

  const todayKey = toLocalDate(new Date());
  // The day/week grids always need a concrete anchor; fall back to today when
  // the date filter is off.
  const anchorDate = dateFilter ?? todayKey;

  // Status applies in every view; the date is an optional filter that narrows
  // the list when set. Confirmed reservations stay at the top because they
  // still require an operational action from the business.
  const filtered = useMemo(
    () =>
      prioritizeConfirmed(
        filterAgenda(bookings, {
          filters: {
            status: status || null,
          },
        }),
      ),
    [bookings, status],
  );

  const listBookings = useMemo(
    () =>
      dateFilter
        ? filterAgenda(filtered, { filters: { dateKey: dateFilter } })
        : filtered,
    [filtered, dateFilter],
  );

  const dateStep = 1;

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
              aria-label="Anterior"
              onClick={() => setDateFilter(shiftDays(anchorDate, -dateStep))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="date"
              value={dateFilter ?? ""}
              onChange={(e) => setDateFilter(e.target.value || null)}
              className="w-full min-w-0 sm:w-40"
              style={{ colorScheme: "dark" }}
              aria-label="Data"
            />
            <Button
              size="sm"
              variant="outline"
              aria-label="Próxima"
              onClick={() => setDateFilter(shiftDays(anchorDate, dateStep))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-border bg-card/40"
            onClick={() => setDateFilter(todayKey)}
          >
            Hoje
          </Button>
          <Button size="sm" variant={dateFilter ? "outline" : "default"} onClick={() => setDateFilter(null)}>
            Todas as datas
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onValueChange={(v) => setStatus((v ?? "") as StatusFilter)} items={STATUS_ITEMS}>
            <SelectTrigger className="w-full sm:w-40">
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

      <div className="mt-4">
        <AgendaList bookings={listBookings} />
      </div>
    </div>
  );
}

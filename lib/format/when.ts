// Shared appointment rendering: `start_at` is UTC and the business timezone is
// supplied by the caller. The default preserves legacy callers.
import { APP_TIMEZONE } from "@/lib/app-timezone";

export function formatWhen(iso: string, timezone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(new Date(iso));

  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${value("day")}/${value("month")}/${value("year")} às ${value("hour")}:${value("minute")}`;
}

// A slot is already a calendar date and time in the business timezone
// (`YYYY-MM-DD` + `HH:mm`), so it is formatted as is, with no UTC conversion:
// "terça-feira, 20/10/2026 às 09:00".
export function formatSlotWhen(date: string, startTime: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day, 12)),
  );
  return `${weekday}, ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year} às ${startTime}`;
}

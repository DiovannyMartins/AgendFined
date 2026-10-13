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

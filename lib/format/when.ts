// Shared appointment rendering: `start_at` is UTC and the business timezone is
// supplied by the caller. The default preserves legacy callers.
import { APP_TIMEZONE, TIMEZONE_OPTIONS } from "@/lib/app-timezone";

// The fuso's UTC offset at `at`: "UTC−3", "UTC+1", or "UTC" itself.
export function formatTimezoneOffset(timezone: string, at: Date | string = new Date()): string {
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" })
      .formatToParts(new Date(at))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // ICU writes the zero offset as "GMT" or "GMT+0" depending on the fuso.
  return offset.replace(/^GMT(?:[+-]0)?$/, "GMT").replace("GMT", "UTC").replace("-", "−");
}

// The city a cliente knows the fuso by ("Manaus"), or null for UTC itself. A
// fuso outside the dashboard's list falls back to its IANA city.
export function timezoneCity(timezone: string): string | null {
  const option = TIMEZONE_OPTIONS.find((o) => o.value === timezone);
  if (option) return option.city;
  const city = timezone.split("/").pop();
  return timezone.includes("/") && city ? city.replaceAll("_", " ") : null;
}

// "Manaus (UTC−4)", or "UTC".
export function formatTimezone(timezone: string, at: Date | string = new Date()): string {
  const city = timezoneCity(timezone);
  const offset = formatTimezoneOffset(timezone, at);
  return city ? `${city} (${offset})` : offset;
}

// formatWhen plus the fuso, for messages read away from the page (e-mails):
// "20/10/2026 às 10:00 (horário de Manaus, UTC−4)".
export function formatWhenWithTimezone(iso: string, timezone: string = APP_TIMEZONE): string {
  const city = timezoneCity(timezone);
  const offset = formatTimezoneOffset(timezone, iso);
  return `${formatWhen(iso, timezone)} (${city ? `horário de ${city}, ${offset}` : offset})`;
}

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

// The calendar date of an instant in the business timezone: "27/10/2026".
export function formatDate(iso: string, timezone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(iso));
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

// Shared appointment rendering: "dd/mm/yyyy às HH:mm" no fuso da aplicação.
// `start_at` é UTC; renderiza o horário local em America/Sao_Paulo.
import { APP_TIMEZONE } from "@/lib/app-timezone";

export function formatWhen(iso: string, _timezone?: string): string {
  void _timezone;
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: APP_TIMEZONE,
  }).formatToParts(new Date(iso));

  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${value("day")}/${value("month")}/${value("year")} às ${value("hour")}:${value("minute")}`;
}

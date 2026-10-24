// Reservas confirmadas que a disponibilidade atual já não cobre (#192). A
// disponibilidade é a regra para novas reservas, então mudar uma faixa não
// cancela nada: o dono só é avisado das que ficaram de fora.
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { timeToMinutes, weekdayOf } from "@/lib/booking/availability";
import { formatWhen } from "@/lib/format/when";

export type OutsideBookingCandidate = {
  customer_name_snapshot: string;
  start_at: string;
  end_at: string;
};

export type FaixaRow = { weekday: number; start_time: string; end_time: string };

// How many reservas the message names before summing up the rest.
const LISTED = 5;

// Calendar date and wall-clock time of an instant in the business timezone.
function localDateTime(iso: string, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, time: `${map.hour}:${map.minute}` };
}

// A reserva fits when it starts and ends inside one faixa of its local
// weekday, as a slot must. A faixa never crosses midnight, so a reserva that
// ends on the next local day never fits.
export function bookingsOutsideAvailability<B extends OutsideBookingCandidate>(
  bookings: B[],
  faixas: FaixaRow[],
  timezone: string = APP_TIMEZONE,
): B[] {
  return bookings.filter((booking) => {
    const start = localDateTime(booking.start_at, timezone);
    const end = localDateTime(booking.end_at, timezone);
    if (end.date !== start.date) return true;
    const weekday = weekdayOf(start.date, timezone);
    return !faixas.some(
      (faixa) =>
        faixa.weekday === weekday &&
        timeToMinutes(faixa.start_time) <= timeToMinutes(start.time) &&
        timeToMinutes(end.time) <= timeToMinutes(faixa.end_time),
    );
  });
}

// Local weekday (1=Domingo..7=Sábado) of a reserva in the business timezone.
export function bookingWeekday(booking: OutsideBookingCandidate, timezone: string = APP_TIMEZONE): number {
  return weekdayOf(localDateTime(booking.start_at, timezone).date, timezone);
}

// Local date (YYYY-MM-DD) of a reserva, the agenda's `?data=` filter.
export function bookingLocalDate(booking: OutsideBookingCandidate, timezone: string = APP_TIMEZONE): string {
  return localDateTime(booking.start_at, timezone).date;
}

// "Você ainda tem 2 reservas fora do novo horário: Ana (26/10/2026 às 10:00),
// Bia (02/11/2026 às 10:00). Elas continuam valendo; ..."
export function outsideBookingsMessage(bookings: OutsideBookingCandidate[], timezone: string = APP_TIMEZONE): string {
  const sorted = [...bookings].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const listed = sorted
    .slice(0, LISTED)
    .map((b) => `${b.customer_name_snapshot} (${formatWhen(b.start_at, timezone)})`)
    .join(", ");
  const rest = sorted.length - LISTED;
  const list = rest > 0 ? `${listed} e mais ${rest}` : listed;
  return sorted.length === 1
    ? `Você ainda tem 1 reserva fora do novo horário: ${list}. Ela continua valendo; se precisar, cancele ou remarque pela agenda.`
    : `Você ainda tem ${sorted.length} reservas fora do novo horário: ${list}. Elas continuam valendo; se precisar, cancele ou remarque pela agenda.`;
}

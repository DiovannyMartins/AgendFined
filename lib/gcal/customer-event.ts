// The cliente's own copy of a reserva for their phone's calendar (#196): one
// event, downloadable as .ics from the confirmation or opened in Google
// Calendar. Unlike the owner's agenda export (lib/gcal/export), it belongs to
// the cliente: it carries only what the confirmation screen already
// shows the cliente (serviço, horário, negócio and its phone, the código
// público), never the token de cancelamento nor a link that holds it. The UID
// is the código público, so downloading again updates the same event.
import { buildGoogleCalendarUrl, buildIcsString, type GcalBooking } from "@/lib/gcal/gcal";
import { formatPublicCode } from "@/lib/bookings/public-code";
import { formatPhoneBR } from "@/lib/format/phone";

// The fields of get_booking_by_public_code the event needs, plus the code.
export type CustomerCalendarBooking = {
  code: string;
  service_name: string;
  start_at: string;
  end_at: string;
  business_name: string;
  business_slug: string;
  business_phone: string | null;
  business_timezone: string | null;
};

function customerCalendarEvent(b: CustomerCalendarBooking, origin: URL): GcalBooking {
  const phone = b.business_phone?.trim();
  return {
    uid: `reserva-${b.code}`,
    summary: `${b.service_name} — ${b.business_name}`,
    description: [
      `Reserva em ${b.business_name}`,
      phone ? `Telefone: ${formatPhoneBR(phone)}` : "",
      `Código da reserva: ${formatPublicCode(b.code)}`,
      new URL(`/${b.business_slug}`, origin).toString(),
    ]
      .filter(Boolean)
      .join("\n"),
    startAt: b.start_at,
    endAt: b.end_at,
    timezone: b.business_timezone ?? undefined,
  };
}

export function buildCustomerIcs(b: CustomerCalendarBooking, origin: URL): string {
  return buildIcsString(customerCalendarEvent(b, origin));
}

export function customerGoogleCalendarUrl(b: CustomerCalendarBooking, origin: URL): string {
  return buildGoogleCalendarUrl(customerCalendarEvent(b, origin));
}

// The two "add to calendar" links a public screen shows (confirmation and
// consulta). The .ics stays a same-origin path, so it opens on whatever host
// the cliente is browsing.
export type CalendarLinks = { icsHref: string; googleHref: string };

export function customerCalendarLinks(b: CustomerCalendarBooking, origin: URL): CalendarLinks {
  const params = new URLSearchParams({ code: b.code });
  return {
    icsHref: `/${encodeURIComponent(b.business_slug)}/confirmacao/evento.ics?${params.toString()}`,
    googleHref: customerGoogleCalendarUrl(b, origin),
  };
}

export function customerIcsFilename(code: string): string {
  return `reserva-${formatPublicCode(code)}.ics`;
}

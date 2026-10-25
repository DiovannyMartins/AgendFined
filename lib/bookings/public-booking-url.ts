// Link to the negócio's public page, used to invite the cliente to reserve
// another horário. It carries no booking data and no capability.
export function buildPublicBookingUrl(origin: URL, slug: string): string {
  return new URL(`/${encodeURIComponent(slug)}`, origin).toString();
}

// Public page of one reserva, resolved by its code alone (ADR 0004). Without the
// capability fragment it shows the reserva but offers no cancel or remarcação.
export function buildPublicConfirmationUrl(origin: URL, slug: string, publicCode: string): string {
  const url = new URL(`/${encodeURIComponent(slug)}/confirmacao`, origin);
  url.searchParams.set("code", publicCode);
  return url.toString();
}

// The reserva's calendar event for the cliente (#196), resolved by the code
// alone like the page it sits under. Built from the confirmation link an
// e-mail already carries; the capability fragment and every other parameter
// are dropped, so the event link never holds the token de cancelamento.
export function buildCalendarEventUrl(confirmationUrl: string): string {
  const url = new URL(confirmationUrl);
  const code = url.searchParams.get("code") ?? "";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/evento.ics`;
  url.search = "";
  url.hash = "";
  url.searchParams.set("code", code);
  return url.toString();
}

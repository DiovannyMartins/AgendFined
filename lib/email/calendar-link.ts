import { buildCalendarEventUrl } from "@/lib/bookings/public-booking-url";
import { escapeHtml } from "@/lib/email/resend";

// The reserva's .ics link in the cliente's e-mails (#196), right under the main
// button. The event's UID is the código público, so the same link adds the
// reserva after the confirmação and updates it after a remarcação.
export function calendarLinkHtml(confirmationUrl: string, label: string): string {
  const href = escapeHtml(buildCalendarEventUrl(confirmationUrl));
  return `
                <p style="margin:14px 0 0;font-size:14px;line-height:22px;"><a href="${href}" style="color:#eeeeee;font-weight:700;text-decoration:underline;">${escapeHtml(label)}</a></p>`;
}

export function calendarLinkText(confirmationUrl: string, label: string): string {
  return `${label}: ${buildCalendarEventUrl(confirmationUrl)}`;
}

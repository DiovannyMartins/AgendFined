// Booking-reminder seam (INC-2, Pro feature). The decision and the email
// content live here as pure functions so they are unit-testable without a
// database or a live email provider. The DB supplies candidate bookings (see the
// `get_due_booking_reminders` RPC); this module decides which are due and turns
// them into the email messages a sender seam (in Supabase Edge Functions) sends,
// marking each one sent afterwards so a scheduling tick never re-sends.
//
// Lead rule (per product decision): ONE reminder, sent when the appointment is
// within 24 hours of now (and still in the future). `start_at` is stored in UTC;
// comparisons use UTC `now`, and the rendered date/time is shown in
// the app timezone.

export const REMINDER_LEAD_MINUTES = 24 * 60;

import { formatWhen } from "@/lib/format/when";

export type ReminderCandidateRow = {
  id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  customer_name_snapshot: string;
  customer_email_snapshot: string | null;
  service_name_snapshot: string;
  start_at: string;
  public_code: string;
};

export type ReminderEmail = {
  bookingId: string;
  to: string;
  subject: string;
  text: string;
};

// Due when the appointment is strictly in the future and no more than the lead
// away (a booking 24h out is still reminded; one 24h+1min is not).
export function isReminderDue(startAt: string, now: Date): boolean {
  const start = new Date(startAt);
  const diffMs = start.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= REMINDER_LEAD_MINUTES * 60_000;
}

// Filter candidates to due ones that actually have a sendable address. The DB
// only surfaces Pro businesses, but the seam stays idempotent and safe: no
// address, no email.
export function prepareReminderEmails(
  rows: ReminderCandidateRow[],
  now: Date,
): ReminderEmail[] {
  return rows
    .filter((row) => row.customer_email_snapshot && isReminderDue(row.start_at, now))
    .map((row) => buildReminderEmail(row));
}

export function buildReminderEmail(row: ReminderCandidateRow): ReminderEmail {
  const to = row.customer_email_snapshot!;
  const when = formatWhen(row.start_at);
  return {
    bookingId: row.id,
    to,
    subject: `Lembrete: seu horário está confirmado — ${row.business_name}`,
    text: [
      `Olá ${row.customer_name_snapshot}!`,
      "",
      `Este é um lembrete da sua reserva confirmada em ${row.business_name}.`,
      `${row.service_name_snapshot} em ${when}.`,
      "",
      "Aguardamos você!",
    ].join("\n"),
  };
}

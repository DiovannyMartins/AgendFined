// The send loop of the booking-reminders Edge Function, apart from Deno.serve so
// it can be tested. One lote carries reservas of every negócio, so each
// candidate is isolated: a candidate whose e-mail cannot be built (a fuso Intl
// rejects, GHSA-xw77-prpg-jpg5) or sent is skipped and left unmarked, and the
// rest of the lote still goes out.

import { buildReminderEmail, type ReminderCandidate, type ReminderEmail } from "./email.ts";

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export type SendableCandidate = Omit<ReminderCandidate, "customer_email_snapshot"> & {
  id: string;
  customer_email_snapshot: string | null;
};

function isDue(startAt: string, now: Date): boolean {
  const diff = new Date(startAt).getTime() - now.getTime();
  return diff > 0 && diff <= REMINDER_LEAD_MS;
}

export async function sendDueReminders(
  candidates: SendableCandidate[],
  { now, appUrl, deliver }: { now: Date; appUrl: string; deliver: (email: ReminderEmail) => Promise<boolean> },
): Promise<string[]> {
  const sentIds: string[] = [];

  for (const candidate of candidates) {
    const to = candidate.customer_email_snapshot;
    if (!to || !isDue(candidate.start_at, now)) continue;

    try {
      const email = buildReminderEmail({ ...candidate, customer_email_snapshot: to }, appUrl);
      if (await deliver(email)) sentIds.push(candidate.id);
    } catch {
      // Unbuildable e-mail or network failure: skip; the next tick retries.
    }
  }

  return sentIds;
}

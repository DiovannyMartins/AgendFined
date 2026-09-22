// Booking-reminder Edge Function (INC-2, Pro feature).
//
// This is the SENDER seam. The pg_cron job (public.process_booking_reminders)
// posts the due candidates to this function; this function turns each candidate
// into an e-mail, sends it and only then marks the booking as reminded
// (public.set_booking_reminders_sent), so a tick never re-sends. It is a no-op
// (no e-mail, no mark) until RESEND_API_KEY + RESEND_FROM_EMAIL are set, so the
// schedule can be created before e-mail is wired without losing reminders.
//
// At-least-once: a failed send leaves the booking unmarked so the next tick
// retries it. Dedup lives in the DB (bookings.reminder_sent_at).
//
// Runs on the Supabase Deno runtime — NOT part of the Next.js TS project
// (excluded in tsconfig.json), so it cannot import `lib/reminders/reminders.ts`
// (Next aliases + tsconfig). The decision/formatting logic below is a hand-kept
// mirror of that pure seam; keep every constant and rule in sync with it.
//
// The `isDue` re-check below uses a SECOND clock (the edge's, not the DB's) as a
// defense-in-depth guard: the DB tick selects candidates with its own `now()`,
// but a candidate can pass into a cancelled/past state while the HTTP request is
// in flight. Unmarked failures are retried by the next tick.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildReminderEmail } from "./email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("REMINDER_CRON_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "";

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
const REMINDER_BATCH_LIMIT = 50;

type Candidate = {
  id: string;
  business_name: string;
  business_timezone?: string;
  customer_name_snapshot: string;
  customer_email_snapshot: string | null;
  service_name_snapshot: string;
  start_at: string;
  public_code: string;
  reminder_claim_token: string;
};

function isCandidate(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Candidate>;
  return Boolean(
    typeof candidate.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(candidate.id) &&
      typeof candidate.business_name === "string" &&
      typeof candidate.customer_name_snapshot === "string" &&
      (typeof candidate.customer_email_snapshot === "string" || candidate.customer_email_snapshot === null) &&
      typeof candidate.service_name_snapshot === "string" &&
      typeof candidate.start_at === "string" &&
      !Number.isNaN(new Date(candidate.start_at).getTime()) &&
      typeof candidate.public_code === "string" &&
      typeof candidate.reminder_claim_token === "string" &&
      /^[0-9a-f-]{36}$/i.test(candidate.reminder_claim_token),
  );
}

function isDue(startAt: string, now: Date): boolean {
  const diff = new Date(startAt).getTime() - now.getTime();
  return diff > 0 && diff <= REMINDER_LEAD_MS;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  let candidates: Candidate[];
  try {
    const body = await req.json();
    if (!Array.isArray(body) || body.length > REMINDER_BATCH_LIMIT || !body.every(isCandidate)) {
      throw new Error("payload must be a bounded candidate array");
    }
    candidates = body;
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }

  const now = new Date();
  const sentIds: string[] = [];

  for (const candidate of candidates) {
    if (!candidate.customer_email_snapshot || !isDue(candidate.start_at, now)) continue;
    // E-mail not wired: leave the booking unmarked so nothing is lost until it is.
    if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) continue;

    const email = buildReminderEmail(candidate);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
      });
      if (res.ok) sentIds.push(candidate.id);
    } catch {
      // Network failure: skip; the next tick retries.
    }
  }

  if (sentIds.length > 0) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "reminder_storage_not_configured" }, 503);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const sentCandidates = candidates.filter((candidate) => sentIds.includes(candidate.id));
    const { data: marked, error } = await admin.rpc("set_booking_reminders_sent", {
      p_booking_ids: sentCandidates.map((candidate) => candidate.id),
      p_claim_tokens: sentCandidates.map((candidate) => candidate.reminder_claim_token),
    });
    if (error || marked !== sentCandidates.length) {
      return json({ error: "reminder_mark_failed" }, 502);
    }
  }

  return json({ attempted: candidates.length, sent: sentIds.length });
});

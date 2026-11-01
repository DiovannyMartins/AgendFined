import "server-only";

import { resolveAppOrigin } from "@/lib/app-origin";
import type { SendResult } from "@/lib/email/resend";
import { sendTrialReminderEmail, type TrialReminderKind } from "@/lib/email/trial-reminder";
import { AGENDFINED_PLAN_INFO } from "@/lib/plan/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database-types";

// Avisos de fim do teste grátis (#261, FR-014): D-3, D-1 e D0. O banco decide
// quais estão devidos, no fuso de cada negócio, e quem não recebe
// (claim_trial_reminders, 20261101010000); aqui cada aviso reservado é enviado
// e só então marcado. Um aviso que falha fica sem marca e volta quando o lease
// vence; o id do envio vai como Idempotency-Key, então um envio que saiu mas
// não foi marcado não chega duas vezes ao dono.
export type TrialReminderClaim = Database["public"]["Functions"]["claim_trial_reminders"]["Returns"][number];

type TrialReminderSend = {
  ownerEmail: string;
  businessName: string;
  kind: TrialReminderKind;
  daysLeft: number;
  trialEndsAt: string;
  timezone: string;
  idempotencyKey: string;
};

type Deps = {
  emailConfigured: boolean;
  claim: () => Promise<TrialReminderClaim[]>;
  send: (email: TrialReminderSend) => Promise<SendResult>;
  mark: (sendId: string, claimToken: string) => Promise<boolean>;
  // The reconciliation route has 60 s for everything; a reserved aviso left
  // unsent comes back when its lease ends.
  outOfTime?: () => boolean;
};

export type TrialRemindersResult = { claimed: number; sent: number; failed: number };

export async function sendTrialReminders({ emailConfigured, claim, send, mark, outOfTime = () => false }: Deps): Promise<TrialRemindersResult> {
  // Sem e-mail configurado, reservar só gastaria as tentativas de cada aviso.
  if (!emailConfigured) return { claimed: 0, sent: 0, failed: 0 };

  const rows = await claim();
  let sent = 0;
  for (const row of rows) {
    if (outOfTime()) break;
    try {
      if (!row.owner_email) throw new Error("owner_email_not_found");
      const result = await send({
        ownerEmail: row.owner_email,
        businessName: row.business_name,
        kind: row.kind as TrialReminderKind,
        daysLeft: row.days_left,
        trialEndsAt: row.trial_ends_at,
        timezone: row.business_timezone,
        idempotencyKey: `trial-reminder-${row.send_id}`,
      });
      if (!result.sent) throw new Error(result.reason);
      if (!(await mark(row.send_id, row.claim_token))) throw new Error("mark_failed");
      sent += 1;
    } catch (error) {
      // Sem o e-mail do dono no log.
      console.error(JSON.stringify({
        event: "trial_reminder_failed",
        businessId: row.business_id,
        kind: row.kind,
        reason: error instanceof Error ? error.message : "unexpected_error",
      }));
    }
  }
  return { claimed: rows.length, sent, failed: rows.length - sent };
}

const TRIAL_REMINDER_BATCH = 10;

// `deadline` (epoch ms) is when the caller needs the run to stop sending; one
// e-mail can still take up to 10 s after it (lib/email/resend.ts).
export async function runTrialReminders({ deadline }: { deadline: number }): Promise<TrialRemindersResult> {
  const admin = createAdminClient();
  const planUrl = new URL("/dashboard/configuracoes#plano", resolveAppOrigin()).toString();

  return sendTrialReminders({
    emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    claim: async () => {
      const { data, error } = await admin.rpc("claim_trial_reminders", { p_limit: TRIAL_REMINDER_BATCH });
      if (error) throw new Error("TRIAL_REMINDERS_CLAIM_FAILED");
      return data ?? [];
    },
    send: (email) => sendTrialReminderEmail({ ...email, price: AGENDFINED_PLAN_INFO.price, planUrl }),
    mark: async (sendId, claimToken) => {
      const { data, error } = await admin.rpc("mark_trial_reminder_sent", { p_send_id: sendId, p_claim_token: claimToken });
      if (error) throw new Error("TRIAL_REMINDERS_MARK_FAILED");
      return data === true;
    },
    outOfTime: () => Date.now() > deadline,
  });
}

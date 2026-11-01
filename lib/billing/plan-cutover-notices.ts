import "server-only";

import { resolveAppOrigin } from "@/lib/app-origin";
import type { SendResult } from "@/lib/email/resend";
import { sendPlanCutoverEmail } from "@/lib/email/plan-cutover";
import { AGENDFINED_PLAN_INFO } from "@/lib/plan/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database-types";

// E-mail da virada do plano único (#261, fase 7; FR-017): one per negócio that
// was on the Grátis and got the teste at the virada. The migration
// (20261101020000) queued them; the banco decides which are still due
// (claim_plan_cutover_notices: not to whoever subscribed since); here each
// reserved one is sent and only then marked. Same pattern as
// lib/billing/trial-reminders.ts: a failed one comes back when its lease ends,
// and the send id goes as Idempotency-Key, so one sent but not marked does not
// reach the dono twice.
export type PlanCutoverNoticeClaim = Database["public"]["Functions"]["claim_plan_cutover_notices"]["Returns"][number];

type PlanCutoverNoticeSend = {
  ownerEmail: string;
  businessName: string;
  trialEndsAt: string;
  timezone: string;
  idempotencyKey: string;
};

type Deps = {
  emailConfigured: boolean;
  claim: () => Promise<PlanCutoverNoticeClaim[]>;
  send: (email: PlanCutoverNoticeSend) => Promise<SendResult>;
  mark: (sendId: string, claimToken: string) => Promise<boolean>;
  outOfTime?: () => boolean;
};

export type PlanCutoverNoticesResult = { claimed: number; sent: number; failed: number };

export async function sendPlanCutoverNotices({ emailConfigured, claim, send, mark, outOfTime = () => false }: Deps): Promise<PlanCutoverNoticesResult> {
  // Sem e-mail configurado, reservar só gastaria as tentativas de cada envio.
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
        trialEndsAt: row.trial_ends_at,
        timezone: row.business_timezone,
        idempotencyKey: `plan-cutover-${row.send_id}`,
      });
      if (!result.sent) throw new Error(result.reason);
      if (!(await mark(row.send_id, row.claim_token))) throw new Error("mark_failed");
      sent += 1;
    } catch (error) {
      // Sem o e-mail do dono no log.
      console.error(JSON.stringify({
        event: "plan_cutover_notice_failed",
        businessId: row.business_id,
        reason: error instanceof Error ? error.message : "unexpected_error",
      }));
    }
  }
  return { claimed: rows.length, sent, failed: rows.length - sent };
}

const PLAN_CUTOVER_NOTICE_BATCH = 10;

// `deadline` (epoch ms) is when the caller needs the run to stop sending; one
// e-mail can still take up to 10 s after it (lib/email/resend.ts).
export async function runPlanCutoverNotices({ deadline }: { deadline: number }): Promise<PlanCutoverNoticesResult> {
  const admin = createAdminClient();
  const origin = resolveAppOrigin();
  const planUrl = new URL("/dashboard/configuracoes#plano", origin).toString();
  const termsUrl = new URL("/termos", origin).toString();
  const privacyUrl = new URL("/privacidade", origin).toString();

  return sendPlanCutoverNotices({
    emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    claim: async () => {
      const { data, error } = await admin.rpc("claim_plan_cutover_notices", { p_limit: PLAN_CUTOVER_NOTICE_BATCH });
      if (error) throw new Error("PLAN_CUTOVER_NOTICES_CLAIM_FAILED");
      return data ?? [];
    },
    send: (email) =>
      sendPlanCutoverEmail({ ...email, price: AGENDFINED_PLAN_INFO.price, planUrl, termsUrl, privacyUrl }),
    mark: async (sendId, claimToken) => {
      const { data, error } = await admin.rpc("mark_plan_cutover_notice_sent", { p_send_id: sendId, p_claim_token: claimToken });
      if (error) throw new Error("PLAN_CUTOVER_NOTICES_MARK_FAILED");
      return data === true;
    },
    outOfTime: () => Date.now() > deadline,
  });
}

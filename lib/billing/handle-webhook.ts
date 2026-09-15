// Mercado Pago webhook lifecycle seam (issue #24). Maps a `preapproval`
// notification (delivered with `type: "subscription_preapproval"`, and accepted
// here as `preapproval` for older/legacy accounts) onto the plan state,
// following ADR 0008:
//   * `authorized`  -> the business becomes Pro; the subscription is authorized.
//   * `paused`/`cancelled` (incl. a failed recurring payment, which Mercado Pago
//     surfaces as `paused`) -> start a 7-day grace period. The business stays
//     Pro during the grace; the downgrade happens after it expires (the
//     `downgrade_expired_subscriptions` RPC, scheduled via pg_cron).
//   * `pending` -> just record the subscription status; never touches the plan.
// The persistence (find/create subscription, set plan, update subscription) is
// injected so the decision core is unit-testable without a database, and the
// plan is never set from the provider's word alone — `authorized` is the only
// path that makes a business Pro, and a missing/invalid status fails closed.
import type { Plan } from "@/lib/plan/plan";
import type { SubscriptionStatus } from "./types";

// The current state of a preapproval, as read from the provider (`GET
// /preapproval/{id}`). `externalReference` is the caller's `external_reference`,
// i.e. the business id, used to locate the business when the subscription row is
// not yet known.
export interface PreapprovalResource {
  status: SubscriptionStatus;
  externalReference: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface WebhookEvent {
  type: string;
  dataId: string;
}

export interface SubscriptionForWebhook {
  id: string;
  businessId: string;
  mpPreapprovalId: string;
  status: SubscriptionStatus;
  plan: Plan;
  gracePeriodEnd: string | null;
}

export type SubscriptionUpdate = {
  status?: SubscriptionStatus;
  plan?: Plan;
  gracePeriodEnd?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
};

export interface HandleWebhookDeps {
  event: WebhookEvent;
  getPreapproval: (dataId: string) => Promise<PreapprovalResource>;
  findSubscription: (mpPreapprovalId: string) => Promise<SubscriptionForWebhook | null>;
  setPlan: (businessId: string, plan: Plan) => Promise<void>;
  updateSubscription: (mpPreapprovalId: string, update: SubscriptionUpdate) => Promise<void>;
  graceDays?: number;
  now?: () => Date;
}

export type HandleWebhookResult =
  | { ok: true; applied: "authorized" | "grace" | "pending" | "ignored" }
  | { ok: false; code: string; message: string };

const DEFAULT_GRACE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

// The `type` values Mercado Pago sends for a preapproval (subscription)
// lifecycle notification. Current accounts use `subscription_preapproval`; the
// legacy value `preapproval` is kept for older integrations.
const PREAPPROVAL_EVENT_TYPES = new Set(["preapproval", "subscription_preapproval"]);

export async function handleWebhook(deps: HandleWebhookDeps): Promise<HandleWebhookResult> {
  const { event } = deps;
  if (!PREAPPROVAL_EVENT_TYPES.has(event.type)) {
    // Non-subscription topics (e.g. `payment`, `subscription_authorized_payment`)
    // are acknowledged and ignored; a failed recurring payment surfaces as the
    // preapproval becoming `paused`, which arrives on the preapproval topic.
    return { ok: true, applied: "ignored" };
  }

  let preapproval: PreapprovalResource;
  try {
    preapproval = await deps.getPreapproval(event.dataId);
  } catch (err) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: err instanceof Error ? err.message : "Não foi possível consultar a assinatura no provedor.",
    };
  }

  const sub = await deps.findSubscription(event.dataId);
  // Never trust external_reference as authorization to grant Pro. A valid
  // provider notification can refer to a preapproval created outside this
  // application, and its external_reference is provider-controlled input.
  // Returning an error makes the route answer 5xx so Mercado Pago retries; this
  // also covers the short race where a new retry preapproval notifies before its
  // local row has been repointed.
  if (!sub) {
    return {
      ok: false,
      code: "UNKNOWN_SUBSCRIPTION",
      message: "A assinatura recebida não está registrada neste sistema.",
    };
  }
  const businessId = sub.businessId;

  const now = deps.now?.() ?? new Date();

  switch (preapproval.status) {
    case "authorized":
      await deps.setPlan(businessId, "pro");
      await deps.updateSubscription(event.dataId, {
        status: "authorized",
        plan: "pro",
        gracePeriodEnd: null,
        currentPeriodStart: preapproval.currentPeriodStart,
        currentPeriodEnd: preapproval.currentPeriodEnd,
      });
      return { ok: true, applied: "authorized" };
    case "paused":
    case "cancelled": {
      // Idempotent grace: preserve an already-set future grace (so a provider
      // retry of the same `paused`/`cancelled` event does not keep pushing the
      // downgrade further out), otherwise start a fresh grace window.
      const existingGrace = sub?.gracePeriodEnd ? new Date(sub.gracePeriodEnd) : null;
      const graceEnd =
        existingGrace && existingGrace.getTime() > now.getTime()
          ? existingGrace
          : new Date(now.getTime() + (deps.graceDays ?? DEFAULT_GRACE_DAYS) * MS_PER_DAY);
      await deps.updateSubscription(event.dataId, {
        status: preapproval.status,
        gracePeriodEnd: graceEnd.toISOString(),
      });
      return { ok: true, applied: "grace" };
    }
    case "pending":
      await deps.updateSubscription(event.dataId, { status: "pending" });
      return { ok: true, applied: "pending" };
    default:
      // An unrecognised status is acknowledged (so Mercado Pago stops retrying)
      // and logged for observability, instead of surfacing a 502 that the
      // provider would retry indefinitely.
      console.warn(`handleWebhook: unknown preapproval status "${preapproval.status}" (${event.dataId})`);
      return { ok: true, applied: "ignored" };
  }
}

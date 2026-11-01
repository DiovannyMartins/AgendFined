import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, businessWithAccess, retryOnFk, SUSPENDED_TRIAL_ENDS_AT } from "./index";
import { startUpgrade, type BillingAttempt, type StartUpgradeDeps } from "@/lib/billing/start-upgrade";
import { handleWebhook, type PreapprovalResource } from "@/lib/billing/handle-webhook";
import { createWebhookPersistence } from "@/lib/billing/webhook-server";
import type { BillingProvider } from "@/lib/billing/provider";
import type { BillingSubscription } from "@/lib/billing/types";

// #261, fase 4 (ADR 0013, ADR 0008): subscribing during the teste grátis.
// startUpgrade reads `businesses.trial_ends_at` as the server action does and
// creates the checkout with the first charge at the end of the teste; Mercado
// Pago then reports it `authorized` with nothing paid and next_payment_date =
// the end of the teste. The webhook runs against the real persistence with a
// stubbed provider. RUN: npm run test:integration.
const stamp = Date.now().toString().slice(-8);
const DAY_MS = 86_400_000;

let admin: ReturnType<typeof adminClient>;
const ownerIds: string[] = [];

async function createNegocio(label: string, trialEndsAt: string): Promise<string> {
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: `trial-checkout-${label}.${stamp}@agendfined.dev`,
    password: `Test-${stamp}-aA1!`,
    email_confirm: true,
  });
  if (userError || !created.user) throw new Error(`user: ${userError?.message}`);
  ownerIds.push(created.user.id);
  await admin.from("profiles").upsert({ id: created.user.id, display_name: `Dona ${label}` }, { onConflict: "id" });
  return retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: created.user.id,
        name: `Teste ${label}`,
        slug: `trial-checkout-${label}-${stamp}`,
        phone: "+5511987650011",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
        trial_ends_at: trialEndsAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(`business insert: ${error.message}`);
    return data.id;
  });
}

// What the server action passes: the row as PostgREST returns it.
async function readTrialEndsAt(businessId: string): Promise<string | null> {
  const { data, error } = await admin.from("businesses").select("trial_ends_at").eq("id", businessId).single();
  if (error) throw new Error(`business read: ${error.message}`);
  return data.trial_ends_at;
}

function mapAttempt(data: {
  id: string;
  business_id: string;
  kind: BillingAttempt["kind"];
  status: BillingAttempt["status"];
  idempotency_key: string;
  provider_preapproval_id: string | null;
}): BillingAttempt {
  return {
    id: data.id,
    businessId: data.business_id,
    kind: data.kind,
    status: data.status,
    idempotencyKey: data.idempotency_key,
    providerPreapprovalId: data.provider_preapproval_id,
  };
}

async function fetchCurrent(businessId: string): Promise<BillingSubscription | null> {
  const { data: business } = await admin.from("businesses").select("current_subscription_id").eq("id", businessId).single();
  if (!business?.current_subscription_id) return null;
  const { data } = await admin.from("subscriptions").select("*").eq("id", business.current_subscription_id).single();
  return data
    ? {
        subscriptionId: data.id,
        mpPreapprovalId: data.mp_preapproval_id,
        status: data.status,
        currentPeriodStart: data.current_period_start,
        currentPeriodEnd: data.current_period_end,
        gracePeriodEnd: data.grace_period_end,
      }
    : null;
}

async function subscribe(businessId: string, mpPreapprovalId: string) {
  const provider: BillingProvider = {
    createPreapproval: vi.fn(async () => ({ preapprovalId: mpPreapprovalId, initPoint: "https://mp.example/checkout" })),
    getPreapproval: vi.fn(),
    cancelPreapproval: vi.fn(),
    updatePreapprovalAmount: vi.fn(),
  };
  const deps: StartUpgradeDeps = {
    business: { id: businessId, trialEndsAt: await readTrialEndsAt(businessId) },
    provider,
    claimAttempt: async (input) => {
      const { data, error } = await admin.rpc("claim_billing_attempt", {
        p_business_id: input.businessId,
        p_kind: input.kind,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error || !data) throw new Error(error?.message ?? "BILLING_ATTEMPT_NOT_RETURNED");
      return mapAttempt(data);
    },
    startAttempt: async (attemptId, key) => {
      const { data, error } = await admin.rpc("start_billing_attempt", { p_attempt_id: attemptId, p_idempotency_key: key });
      if (error || !data) throw new Error(error?.message ?? "BILLING_ATTEMPT_NOT_RETURNED");
      return mapAttempt(data);
    },
    finishAttempt: async (input) => {
      const { data, error } = await admin.rpc("finish_billing_attempt", {
        p_attempt_id: input.attemptId,
        p_status: input.status,
        p_provider_preapproval_id: input.providerPreapprovalId ?? null,
      });
      if (error || !data) throw new Error(error?.message ?? "BILLING_ATTEMPT_NOT_RETURNED");
      return mapAttempt(data);
    },
    linkAttempt: async (input) => {
      const { error } = await admin.rpc("link_billing_attempt_subscription", {
        p_attempt_id: input.attemptId,
        p_mp_preapproval_id: input.mpPreapprovalId,
        p_status: "pending",
      });
      if (error) throw new Error(error.message);
    },
    fetchSubscription: fetchCurrent,
    backUrl: "https://app.example/api/billing/return",
    idempotencyKey: `trial-checkout-${mpPreapprovalId}`,
    checkoutLimits: { countPendingCheckouts: async () => 0, consumeCheckout: async () => true },
    reportOrphanCheckout: vi.fn(),
  };
  const result = await startUpgrade(deps);
  expect(result).toEqual({ ok: true, initPoint: "https://mp.example/checkout" });
  return vi.mocked(provider.createPreapproval).mock.calls[0][0];
}

function notify(businessId: string, mpPreapprovalId: string, snapshot: Partial<PreapprovalResource>) {
  return handleWebhook({
    event: { type: "subscription_preapproval", dataId: mpPreapprovalId },
    getPreapproval: async () => ({
      status: "authorized",
      externalReference: businessId,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      transactionAmount: 19.9,
      currencyId: "BRL",
      frequency: 1,
      frequencyType: "months",
      ...snapshot,
    }),
    ...createWebhookPersistence(),
    cancelPreapproval: async () => undefined,
    reportDoubleCharge: () => undefined,
    currentPriceCents: 1990,
    reportStalePriceCharge: () => undefined,
    reportUnexpectedTermsCharge: () => undefined,
  });
}

beforeAll(() => {
  admin = adminClient();
});

afterAll(async () => {
  for (const ownerId of ownerIds) {
    await admin.from("businesses").delete().eq("owner_id", ownerId);
    await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  }
});

describe("subscribing during the teste grátis (FR-011)", () => {
  it("starts the first charge at trial_ends_at and keeps the access, unpaid, until then; cancelling keeps it too", async () => {
    const trialEnd = new Date(Math.floor(Date.now() / 1000) * 1000 + 20 * DAY_MS).toISOString();
    const businessId = await createNegocio("teste", trialEnd);
    const mpId = `mp-trial-${stamp}`;

    const input = await subscribe(businessId, mpId);
    expect(input.startDate).toBe(trialEnd);

    // Authorized at Mercado Pago with nothing paid: the first charge is the end
    // of the teste. Neither the terms gate nor the webhook refuse it.
    await expect(
      notify(businessId, mpId, { status: "authorized", currentPeriodStart: trialEnd, currentPeriodEnd: trialEnd }),
    ).resolves.toEqual({ ok: true, applied: "authorized" });
    expect((await fetchCurrent(businessId))?.status).toBe("authorized");

    // The teste ends before the first charge: the authorized assinatura keeps
    // the access.
    await admin.from("businesses").update({ trial_ends_at: SUSPENDED_TRIAL_ENDS_AT }).eq("id", businessId);
    expect((await businessWithAccess(businessId)).has_access).toBe(true);

    // Cancelled before the first charge: carência until next_payment_date (the
    // end of the teste), as for any authorized assinatura (ADR 0008).
    await expect(
      notify(businessId, mpId, { status: "cancelled", currentPeriodStart: trialEnd, currentPeriodEnd: trialEnd }),
    ).resolves.toEqual({ ok: true, applied: "grace" });
    const cancelled = await fetchCurrent(businessId);
    expect(cancelled?.status).toBe("cancelled");
    expect(new Date(cancelled!.gracePeriodEnd!).toISOString()).toBe(trialEnd);
    expect((await businessWithAccess(businessId)).has_access).toBe(true);

    // The end of the carência suspends the negócio, without a cron (FR-012).
    await admin.from("subscriptions").update({ grace_period_end: SUSPENDED_TRIAL_ENDS_AT }).eq("mp_preapproval_id", mpId);
    expect((await businessWithAccess(businessId)).has_access).toBe(false);
  });

  it("charges now a negócio whose teste ended (suspenso)", async () => {
    const businessId = await createNegocio("suspenso", SUSPENDED_TRIAL_ENDS_AT);
    expect((await subscribe(businessId, `mp-trial-suspenso-${stamp}`)).startDate).toBeNull();
  });

  // Until the virada (fase 7) a negócio older than the plano único has
  // trial_ends_at = 'infinity': it is charged now, as before the plano único.
  it("charges now a legacy negócio ('infinity')", async () => {
    const businessId = await createNegocio("legado", "infinity");
    expect(await readTrialEndsAt(businessId)).toBe("infinity");
    expect((await subscribe(businessId, `mp-trial-legado-${stamp}`)).startDate).toBeNull();
  });
});

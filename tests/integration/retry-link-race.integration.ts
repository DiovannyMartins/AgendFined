import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, retryOnFk } from "./index";
import { handleWebhook, type HandleWebhookResult, type PreapprovalResource } from "@/lib/billing/handle-webhook";
import { createWebhookPersistence } from "@/lib/billing/webhook-server";
import { retryPendingUpgrade, type RetryUpgradeDeps } from "@/lib/billing/retry-upgrade";
import type { BillingAttempt } from "@/lib/billing/start-upgrade";
import type { BillingProvider } from "@/lib/billing/provider";
import type { Database } from "@/lib/supabase/database-types";

// A retry reserves the current pending checkout and then waits on Mercado Pago
// to create the replacement. If the payer pays an older, superseded link in that
// window, the webhook makes it the current assinatura. The retry must not take
// the pointer back to its new, unpaid checkout when it links it afterwards, nor
// move it away from the checkout it reserved once that one is paid.
// Drives the retry and the webhook with the real RPCs (service role) and a
// stubbed Mercado Pago.
const stamp = Date.now().toString().slice(-8);
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const NOW = new Date("2026-10-16T12:00:00.000Z");

let admin: ReturnType<typeof adminClient>;
const ownerIds: string[] = [];

const providerStatus = new Map<string, PreapprovalResource["status"]>();

function notify(mpPreapprovalId: string) {
  return handleWebhook({
    event: { type: "subscription_preapproval", dataId: mpPreapprovalId },
    getPreapproval: async (id) => ({
      status: providerStatus.get(id) ?? "pending",
      externalReference: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      transactionAmount: 19.9,
      currencyId: "BRL",
      frequency: 1,
      frequencyType: "months",
    }),
    ...createWebhookPersistence(),
    cancelPreapproval: async (id) => {
      providerStatus.set(id, "cancelled");
    },
    reportDoubleCharge: vi.fn(),
    currentPriceCents: 1990,
    reportStalePriceCharge: vi.fn(),
    reportUnexpectedTermsCharge: vi.fn(),
    now: () => NOW,
  });
}

function mapAttempt(row: Database["public"]["Tables"]["billing_attempts"]["Row"] | null): BillingAttempt {
  if (!row) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
  return {
    id: row.id,
    businessId: row.business_id,
    kind: row.kind,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    providerPreapprovalId: row.provider_preapproval_id,
  };
}

// The same RPC wiring as the `retryUpgrade` server action, with the service role.
function retryPersistence(): Omit<RetryUpgradeDeps, "business" | "provider" | "backUrl" | "idempotencyKey"> {
  return {
    reportOrphanCheckout: vi.fn(),
    checkoutLimits: { countPendingCheckouts: async () => 0, consumeCheckout: async () => true },
    fetchSubscription: async (id) => {
      const { data: business, error: businessError } = await admin
        .from("businesses")
        .select("current_subscription_id")
        .eq("id", id)
        .single();
      if (businessError) throw new Error(businessError.message);
      if (!business.current_subscription_id) return null;
      const { data, error } = await admin
        .from("subscriptions")
        .select("*")
        .eq("id", business.current_subscription_id)
        .single();
      if (error) throw new Error(error.message);
      return {
        subscriptionId: data.id,
        mpPreapprovalId: data.mp_preapproval_id,
        status: data.status,
        currentPeriodStart: data.current_period_start,
        currentPeriodEnd: data.current_period_end,
      };
    },
    claimAttempt: async (input) => {
      const { data, error } = await admin.rpc("claim_billing_attempt", {
        p_business_id: input.businessId,
        p_kind: input.kind,
        p_expected_subscription_id: input.expectedSubscriptionId,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return mapAttempt(data);
    },
    startRetry: async (input) => {
      const { data, error } = await admin.rpc("start_billing_retry", {
        p_attempt_id: input.attemptId,
        p_idempotency_key: input.idempotencyKey,
        p_expected_subscription_id: input.expectedSubscriptionId,
        p_expected_mp_preapproval_id: input.expectedMpPreapprovalId,
      });
      if (error) throw new Error(error.message);
      return mapAttempt(data);
    },
    finishAttempt: async (input) => {
      const { data, error } = await admin.rpc("finish_billing_attempt", {
        p_attempt_id: input.attemptId,
        p_status: input.status,
        p_provider_preapproval_id: input.providerPreapprovalId ?? null,
      });
      if (error) throw new Error(error.message);
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
  };
}

// A negócio without an assinatura, with its own owner (each owner has exactly one negócio).
async function createNegocio(label: string): Promise<string> {
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: `retry-race-${label}.${stamp}@agendfined.dev`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError || !created?.user?.id) throw new Error(`owner: ${userError?.message ?? "no id"}`);
  const ownerId = created.user.id;
  ownerIds.push(ownerId);
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Corrida" }, { onConflict: "id" });

  return retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Corrida",
        slug: `agenda-retry-race-${label}-${stamp}`,
        phone: "+5511955555555",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  });
}

async function insertPendingSubscription(businessId: string, mpPreapprovalId: string): Promise<string> {
  const { data, error } = await admin
    .from("subscriptions")
    .insert({ business_id: businessId, mp_preapproval_id: mpPreapprovalId, status: "pending" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`subscription: ${error?.message ?? "no id"}`);
  return data.id;
}

async function setCurrent(businessId: string, subscriptionId: string) {
  const { error } = await admin
    .from("businesses")
    .update({ current_subscription_id: subscriptionId })
    .eq("id", businessId);
  if (error) throw new Error(`set current: ${error.message}`);
}

async function readBusiness(businessId: string) {
  const { data, error } = await admin
    .from("businesses")
    .select("current_subscription_id")
    .eq("id", businessId)
    .single();
  if (error) throw new Error(`business read: ${error.message}`);
  return data;
}

async function readAttempt(idempotencyKey: string) {
  const { data, error } = await admin
    .from("billing_attempts")
    .select("status, provider_preapproval_id")
    .eq("idempotency_key", idempotencyKey)
    .single();
  if (error) throw new Error(`attempt read: ${error.message}`);
  return data;
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

describe("retry racing a paid superseded checkout", () => {
  const MP_OLD = `mp-race-old-${stamp}`;
  const MP_CURRENT = `mp-race-current-${stamp}`;
  const MP_RETRY = `mp-race-retry-${stamp}`;
  let businessId = "";
  let oldSubscriptionId = "";

  beforeAll(async () => {
    // An earlier retry left the first checkout payable; the second is current.
    businessId = await createNegocio("superseded");
    oldSubscriptionId = await insertPendingSubscription(businessId, MP_OLD);
    await setCurrent(businessId, await insertPendingSubscription(businessId, MP_CURRENT));
  });

  it("keeps the paid checkout current and returns no link when it is paid while the retry creates its checkout", async () => {
    const idempotencyKey = `retry-race-${stamp}`;
    let webhook: HandleWebhookResult | undefined;
    const provider: BillingProvider = {
      createPreapproval: vi.fn(async () => {
        // The payer pays the old link while Mercado Pago creates the new checkout.
        providerStatus.set(MP_OLD, "authorized");
        webhook = await notify(MP_OLD);
        return { preapprovalId: MP_RETRY, initPoint: "https://mp.example/retry" };
      }),
      getPreapproval: vi.fn(),
      cancelPreapproval: vi.fn(),
      updatePreapprovalAmount: vi.fn(),
    };

    const result = await retryPendingUpgrade({
      business: { id: businessId, trialEndsAt: null },
      provider,
      ...retryPersistence(),
      backUrl: "https://app.example/api/billing/return",
      idempotencyKey,
    });

    expect(webhook).toEqual({ ok: true, applied: "authorized" });
    expect(result).toEqual({ ok: false, code: "RETRY_SUBSCRIPTION_CONFLICT", message: expect.any(String) });
    expect(provider.cancelPreapproval).toHaveBeenCalledWith(MP_RETRY);
    expect(await readBusiness(businessId)).toEqual({ current_subscription_id: oldSubscriptionId });
    expect(await readAttempt(idempotencyKey)).toEqual({ status: "failed", provider_preapproval_id: MP_RETRY });
  });
});

describe("retry racing a payment of the checkout it replaces", () => {
  it("keeps the paid checkout current and returns no link when it is paid while the retry creates its checkout", async () => {
    const MP_CURRENT = `mp-race-paid-current-${stamp}`;
    const MP_RETRY = `mp-race-paid-retry-${stamp}`;
    const idempotencyKey = `retry-race-paid-${stamp}`;
    const businessId = await createNegocio("current");
    const currentSubscriptionId = await insertPendingSubscription(businessId, MP_CURRENT);
    await setCurrent(businessId, currentSubscriptionId);
    let webhook: HandleWebhookResult | undefined;
    const provider: BillingProvider = {
      createPreapproval: vi.fn(async () => {
        // The payer pays the current link (e.g. in another tab) while Mercado
        // Pago creates the replacement; the pointer does not move.
        providerStatus.set(MP_CURRENT, "authorized");
        webhook = await notify(MP_CURRENT);
        return { preapprovalId: MP_RETRY, initPoint: "https://mp.example/retry-paid" };
      }),
      getPreapproval: vi.fn(),
      cancelPreapproval: vi.fn(),
      updatePreapprovalAmount: vi.fn(),
    };

    const result = await retryPendingUpgrade({
      business: { id: businessId, trialEndsAt: null },
      provider,
      ...retryPersistence(),
      backUrl: "https://app.example/api/billing/return",
      idempotencyKey,
    });

    expect(webhook).toEqual({ ok: true, applied: "authorized" });
    expect(result).toEqual({ ok: false, code: "RETRY_SUBSCRIPTION_CONFLICT", message: expect.any(String) });
    expect(provider.cancelPreapproval).toHaveBeenCalledWith(MP_RETRY);
    expect(await readBusiness(businessId)).toEqual({ current_subscription_id: currentSubscriptionId });
    expect(await readAttempt(idempotencyKey)).toEqual({ status: "failed", provider_preapproval_id: MP_RETRY });
  });
});

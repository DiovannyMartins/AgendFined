import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, retryOnFk } from "./index";
import { handleWebhook, type HandleWebhookResult, type PreapprovalResource } from "@/lib/billing/handle-webhook";
import { createWebhookPersistence } from "@/lib/billing/webhook-server";
import { MercadoPagoAmbiguousError } from "@/lib/billing/mercado-pago";
import { startUpgrade, type BillingAttempt, type StartUpgradeDeps } from "@/lib/billing/start-upgrade";
import type { BillingProvider } from "@/lib/billing/provider";
import type { Database } from "@/lib/supabase/database-types";

// An initial upgrade reads the current assinatura when it claims the attempt and
// then waits on Mercado Pago to create the checkout. If the payer pays an older,
// superseded link in that window, the webhook makes it the current assinatura.
// Linking the new checkout must not take the pointer away from the paid one, and
// reconciling an initial whose checkout response was lost must follow the same
// rule. Drives `startUpgrade`, the webhook and the reconciliation RPC with the
// real database (service role) and a stubbed Mercado Pago.
const stamp = Date.now().toString().slice(-8);
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const NOW = new Date("2026-10-17T12:00:00.000Z");

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
    }),
    ...createWebhookPersistence(),
    cancelPreapproval: async (id) => {
      providerStatus.set(id, "cancelled");
    },
    reportDoubleCharge: vi.fn(),
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

// The same RPC wiring as the `startUpgrade` server action, with the service role.
function upgradePersistence(): Omit<StartUpgradeDeps, "business" | "provider" | "backUrl" | "idempotencyKey"> {
  return {
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
        plan: data.plan,
        currentPeriodStart: data.current_period_start,
        currentPeriodEnd: data.current_period_end,
        gracePeriodEnd: data.grace_period_end,
      };
    },
    claimAttempt: async (input) => {
      const { data, error } = await admin.rpc("claim_billing_attempt", {
        p_business_id: input.businessId,
        p_kind: input.kind,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return mapAttempt(data);
    },
    startAttempt: async (attemptId, idempotencyKey) => {
      const { data, error } = await admin.rpc("start_billing_attempt", {
        p_attempt_id: attemptId,
        p_idempotency_key: idempotencyKey,
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

// A Grátis negócio with its own owner (each owner has exactly one negócio).
async function createNegocio(label: string): Promise<string> {
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: `initial-race-${label}.${stamp}@agendfined.dev`,
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
        slug: `agenda-initial-race-${label}-${stamp}`,
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

async function insertSubscription(
  businessId: string,
  mpPreapprovalId: string,
  fields: { status: Database["public"]["Enums"]["subscription_status"]; grace_period_end?: string | null },
): Promise<string> {
  const { data, error } = await admin
    .from("subscriptions")
    .insert({ business_id: businessId, mp_preapproval_id: mpPreapprovalId, plan: "pro", ...fields })
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
    .select("plan, current_subscription_id")
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

async function attemptId(idempotencyKey: string): Promise<string> {
  const { data, error } = await admin
    .from("billing_attempts")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .single();
  if (error) throw new Error(`attempt read: ${error.message}`);
  return data.id;
}

async function subscriptionId(mpPreapprovalId: string): Promise<string> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id")
    .eq("mp_preapproval_id", mpPreapprovalId)
    .single();
  if (error) throw new Error(`subscription read: ${error.message}`);
  return data.id;
}

// Mercado Pago created the checkout but its response was lost.
function ambiguousProvider(): BillingProvider {
  return {
    createPreapproval: vi.fn(async () => {
      throw new MercadoPagoAmbiguousError("timeout");
    }),
    getPreapproval: vi.fn(),
    cancelPreapproval: vi.fn(),
  };
}

// The reconciliation's finalize step, fenced by its claim like the runner does.
async function reconcile(attempt: string, mpPreapprovalId: string, status: Database["public"]["Enums"]["subscription_status"]) {
  const resourceKey = `billing-attempt/${attempt}`;
  const claimToken = randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc("claim_billing_reconciliation", {
    p_resource_key: resourceKey,
    p_claim_token: claimToken,
    p_lease_seconds: 60,
  });
  if (claimError || !claimed) throw new Error(`reconciliation claim: ${claimError?.message ?? "not claimed"}`);
  try {
    return await admin.rpc("reconcile_billing_attempt_subscription", {
      p_attempt_id: attempt,
      p_mp_preapproval_id: mpPreapprovalId,
      p_status: status,
      p_claim_token: claimToken,
    });
  } finally {
    await admin.rpc("release_billing_reconciliation", { p_resource_key: resourceKey, p_claim_token: claimToken });
  }
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

describe("initial upgrade racing a paid superseded checkout", () => {
  const MP_OLD = `mp-initial-old-${stamp}`;
  const MP_CLOSED = `mp-initial-closed-${stamp}`;
  const MP_NEW = `mp-initial-new-${stamp}`;
  let businessId = "";
  let oldSubscriptionId = "";

  beforeAll(async () => {
    // A retry left the first checkout payable; the one that replaced it was
    // closed without payment and is still the current subscription.
    businessId = await createNegocio("link");
    oldSubscriptionId = await insertSubscription(businessId, MP_OLD, { status: "pending" });
    await setCurrent(businessId, await insertSubscription(businessId, MP_CLOSED, { status: "cancelled" }));
  });

  it("keeps the paid checkout current and returns no link when it is paid while the upgrade creates its checkout", async () => {
    const idempotencyKey = `initial-race-link-${stamp}`;
    let webhook: HandleWebhookResult | undefined;
    const provider: BillingProvider = {
      createPreapproval: vi.fn(async () => {
        // The payer pays the old link while Mercado Pago creates the new checkout.
        providerStatus.set(MP_OLD, "authorized");
        webhook = await notify(MP_OLD);
        return { preapprovalId: MP_NEW, initPoint: "https://mp.example/initial" };
      }),
      getPreapproval: vi.fn(),
      cancelPreapproval: vi.fn(),
    };

    const result = await startUpgrade({
      business: { id: businessId, plan: "free" },
      provider,
      ...upgradePersistence(),
      backUrl: "https://app.example/api/billing/return",
      idempotencyKey,
    });

    expect(webhook).toEqual({ ok: true, applied: "authorized" });
    expect(result).toEqual({ ok: false, code: "UPGRADE_SUBSCRIPTION_CONFLICT", message: expect.any(String) });
    expect(await readBusiness(businessId)).toEqual({ plan: "pro", current_subscription_id: oldSubscriptionId });
    expect(await readAttempt(idempotencyKey)).toEqual({ status: "failed", provider_preapproval_id: MP_NEW });
  });
});

// A PROFISSIONAL negócio whose assinatura was paused (failed recurring payment)
// and is in carência; the owner may start a fresh preapproval.
async function createNegocioInCarencia(label: string, mpPreapprovalId: string) {
  const businessId = await createNegocio(label);
  const currentSubscriptionId = await insertSubscription(businessId, mpPreapprovalId, {
    status: "paused",
    grace_period_end: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  await setCurrent(businessId, currentSubscriptionId);
  const { error } = await admin.from("businesses").update({ plan: "pro" }).eq("id", businessId);
  if (error) throw new Error(`plan: ${error.message}`);
  return { businessId, currentSubscriptionId };
}

describe("re-subscription in carência racing a recovered payment", () => {
  it("keeps the recovered assinatura current and returns no link when it is paid while the upgrade creates its checkout", async () => {
    const MP_PAUSED = `mp-initial-paused-${stamp}`;
    const MP_NEW = `mp-initial-paused-new-${stamp}`;
    const idempotencyKey = `initial-race-paused-${stamp}`;
    const { businessId, currentSubscriptionId } = await createNegocioInCarencia("paused", MP_PAUSED);
    let webhook: HandleWebhookResult | undefined;
    const provider: BillingProvider = {
      createPreapproval: vi.fn(async () => {
        // Mercado Pago recovers the paused assinatura's payment meanwhile.
        providerStatus.set(MP_PAUSED, "authorized");
        webhook = await notify(MP_PAUSED);
        return { preapprovalId: MP_NEW, initPoint: "https://mp.example/resub" };
      }),
      getPreapproval: vi.fn(),
      cancelPreapproval: vi.fn(),
    };

    const result = await startUpgrade({
      business: { id: businessId, plan: "pro" },
      provider,
      ...upgradePersistence(),
      backUrl: "https://app.example/api/billing/return",
      idempotencyKey,
    });

    expect(webhook).toEqual({ ok: true, applied: "authorized" });
    expect(result).toEqual({ ok: false, code: "UPGRADE_SUBSCRIPTION_CONFLICT", message: expect.any(String) });
    expect(await readBusiness(businessId)).toEqual({ plan: "pro", current_subscription_id: currentSubscriptionId });
    expect(await readAttempt(idempotencyKey)).toEqual({ status: "failed", provider_preapproval_id: MP_NEW });
  });
});

describe("reconciling an initial upgrade whose checkout response was lost", () => {
  it("links the checkout and makes it current when the current subscription did not change (re-subscription in carência)", async () => {
    const MP_GRACE = `mp-initial-grace-${stamp}`;
    const MP_NEW = `mp-initial-resub-${stamp}`;
    const idempotencyKey = `initial-race-resub-${stamp}`;
    // A PROFISSIONAL negócio whose assinatura was cancelled and is in carência.
    const businessId = await createNegocio("resub");
    await setCurrent(
      businessId,
      await insertSubscription(businessId, MP_GRACE, {
        status: "cancelled",
        grace_period_end: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }),
    );
    const { error: planError } = await admin.from("businesses").update({ plan: "pro" }).eq("id", businessId);
    if (planError) throw new Error(`plan: ${planError.message}`);

    const result = await startUpgrade({
      business: { id: businessId, plan: "pro" },
      provider: ambiguousProvider(),
      ...upgradePersistence(),
      backUrl: "https://app.example/api/billing/return",
      idempotencyKey,
    });
    expect(result).toEqual({ ok: false, code: "PROVIDER_UNKNOWN", message: expect.any(String) });

    const { error } = await reconcile(await attemptId(idempotencyKey), MP_NEW, "pending");

    expect(error).toBeNull();
    expect(await readBusiness(businessId)).toEqual({ plan: "pro", current_subscription_id: await subscriptionId(MP_NEW) });
    expect(await readAttempt(idempotencyKey)).toEqual({ status: "linked", provider_preapproval_id: MP_NEW });
  });

  // A Grátis negócio whose closed checkout is current, with an older one still
  // payable; the upgrade's checkout response is lost and the payer then pays
  // the old link, so the webhook makes it the current assinatura.
  async function loseUpgradeThenPayOldLink(label: string, idempotencyKey: string) {
    const MP_OLD = `mp-initial-${label}-old-${stamp}`;
    const businessId = await createNegocio(label);
    const oldSubscriptionId = await insertSubscription(businessId, MP_OLD, { status: "pending" });
    await setCurrent(businessId, await insertSubscription(businessId, `mp-initial-${label}-closed-${stamp}`, { status: "cancelled" }));

    const result = await startUpgrade({
      business: { id: businessId, plan: "free" },
      provider: ambiguousProvider(),
      ...upgradePersistence(),
      backUrl: "https://app.example/api/billing/return",
      idempotencyKey,
    });
    expect(result).toEqual({ ok: false, code: "PROVIDER_UNKNOWN", message: expect.any(String) });
    providerStatus.set(MP_OLD, "authorized");
    expect(await notify(MP_OLD)).toEqual({ ok: true, applied: "authorized" });
    return { businessId, oldSubscriptionId };
  }

  it("keeps the paid checkout current and closes the attempt when a superseded checkout was paid before reconciliation", async () => {
    const MP_NEW = `mp-initial-lost-new-${stamp}`;
    const idempotencyKey = `initial-race-lost-${stamp}`;
    const { businessId, oldSubscriptionId } = await loseUpgradeThenPayOldLink("lost", idempotencyKey);

    const { error } = await reconcile(await attemptId(idempotencyKey), MP_NEW, "pending");

    expect(error).toBeNull();
    expect(await readBusiness(businessId)).toEqual({ plan: "pro", current_subscription_id: oldSubscriptionId });
    expect(await readAttempt(idempotencyKey)).toEqual({ status: "failed", provider_preapproval_id: MP_NEW });
  });

  it("leaves the attempt for manual review when its own checkout was paid too (double charge)", async () => {
    const MP_NEW = `mp-initial-double-new-${stamp}`;
    const idempotencyKey = `initial-race-double-${stamp}`;
    const { businessId, oldSubscriptionId } = await loseUpgradeThenPayOldLink("double", idempotencyKey);

    const { error } = await reconcile(await attemptId(idempotencyKey), MP_NEW, "authorized");

    expect(error?.message).toBe("current subscription changed during reconciliation");
    expect(await readBusiness(businessId)).toEqual({ plan: "pro", current_subscription_id: oldSubscriptionId });
    expect(await readAttempt(idempotencyKey)).toEqual({ status: "unknown", provider_preapproval_id: null });
  });

  it("keeps a recovered assinatura current and closes the attempt (re-subscription in carência)", async () => {
    const MP_PAUSED = `mp-initial-recovered-${stamp}`;
    const MP_NEW = `mp-initial-recovered-new-${stamp}`;
    const idempotencyKey = `initial-race-recovered-${stamp}`;
    const { businessId, currentSubscriptionId } = await createNegocioInCarencia("recovered", MP_PAUSED);
    const result = await startUpgrade({
      business: { id: businessId, plan: "pro" },
      provider: ambiguousProvider(),
      ...upgradePersistence(),
      backUrl: "https://app.example/api/billing/return",
      idempotencyKey,
    });
    expect(result).toEqual({ ok: false, code: "PROVIDER_UNKNOWN", message: expect.any(String) });
    // Mercado Pago recovers the paused assinatura's payment; the pointer stays.
    providerStatus.set(MP_PAUSED, "authorized");
    expect(await notify(MP_PAUSED)).toEqual({ ok: true, applied: "authorized" });

    const { error } = await reconcile(await attemptId(idempotencyKey), MP_NEW, "pending");

    expect(error).toBeNull();
    expect(await readBusiness(businessId)).toEqual({ plan: "pro", current_subscription_id: currentSubscriptionId });
    expect(await readAttempt(idempotencyKey)).toEqual({ status: "failed", provider_preapproval_id: MP_NEW });
  });
});

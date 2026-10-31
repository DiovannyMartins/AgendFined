import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, retryOnFk } from "./index";
import { handleWebhook, type PreapprovalResource } from "@/lib/billing/handle-webhook";
import { createWebhookPersistence } from "@/lib/billing/webhook-server";
import { syncReturnedSubscription } from "@/lib/billing/return-sync";
import type { BillingSubscription } from "@/lib/billing/types";

// The payer usually returns from the checkout before the webhook arrives. A
// checkout created before a price change, paid at the old price, must not be
// activated by the return either: applying it there made the webhook find the
// assinatura already authorized and skip its check. Drives the return and the
// webhook with the real persistence (service role) and a stubbed Mercado Pago.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `terms-return.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const MP_STALE = `mp-terms-return-${stamp}`;
const NOW = new Date("2026-10-17T12:00:00.000Z");

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";

const providerStatus = new Map<string, PreapprovalResource["status"]>();
const cancelPreapproval = vi.fn(async (id: string) => {
  providerStatus.set(id, "cancelled");
});
const reportStalePriceCharge = vi.fn();

// A checkout created at R$ 19,00, before the price became R$ 19,90.
function stalePriceCheckout(id: string) {
  return {
    status: providerStatus.get(id) ?? "pending",
    externalReference: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    transactionAmount: 19,
    currencyId: "BRL",
    frequency: 1,
    frequencyType: "months",
  } satisfies PreapprovalResource;
}

const checkoutTerms = {
  cancelPreapproval,
  currentPriceCents: 1990,
  reportStalePriceCharge,
  reportUnexpectedTermsCharge: () => undefined,
};

// The owner's current subscription, read with the service role instead of the
// owner session the server action uses.
async function fetchCurrentSubscription(id: string): Promise<BillingSubscription | null> {
  const { data: business, error: businessError } = await admin
    .from("businesses")
    .select("current_subscription_id")
    .eq("id", id)
    .single();
  if (businessError) throw new Error(`business read: ${businessError.message}`);
  if (!business.current_subscription_id) return null;
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("id", business.current_subscription_id)
    .single();
  if (error) throw new Error(`subscription read: ${error.message}`);
  return {
    subscriptionId: data.id,
    mpPreapprovalId: data.mp_preapproval_id,
    status: data.status,
    plan: data.plan,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    gracePeriodEnd: data.grace_period_end,
  };
}

function notify(mpPreapprovalId: string) {
  return handleWebhook({
    event: { type: "subscription_preapproval", dataId: mpPreapprovalId },
    getPreapproval: async (id) => stalePriceCheckout(id),
    ...createWebhookPersistence(),
    ...checkoutTerms,
    reportDoubleCharge: () => undefined,
    now: () => NOW,
  });
}

async function readBusiness() {
  const { data, error } = await admin.from("businesses").select("plan").eq("id", businessId).single();
  if (error) throw new Error(`business read: ${error.message}`);
  return data;
}

async function readSubscription() {
  const { data, error } = await admin
    .from("subscriptions")
    .select("status, grace_period_end")
    .eq("mp_preapproval_id", MP_STALE)
    .single();
  if (error) throw new Error(`subscription read: ${error.message}`);
  return data;
}

beforeAll(async () => {
  admin = adminClient();
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError || !created?.user?.id) throw new Error(`owner: ${userError?.message ?? "no id"}`);
  ownerId = created.user.id;
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Retorno" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Retorno",
        slug: `agenda-terms-return-${stamp}`,
        phone: "+5511944444445",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  });

  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .insert({ business_id: businessId, mp_preapproval_id: MP_STALE, plan: "pro", status: "pending" })
    .select("id")
    .single();
  if (subscriptionError || !subscription) throw new Error(`subscription: ${subscriptionError?.message ?? "no id"}`);
  const { error } = await admin
    .from("businesses")
    .update({ current_subscription_id: subscription.id })
    .eq("id", businessId);
  if (error) throw new Error(`set current: ${error.message}`);
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("checkout paid at an outdated price, payer back before the webhook", () => {
  it("the return keeps the negócio on Grátis, reports the charge and cancels the checkout", async () => {
    providerStatus.set(MP_STALE, "authorized");

    const result = await syncReturnedSubscription(businessId, {
      fetchSubscription: fetchCurrentSubscription,
      getPreapproval: async (id) => ({ id, ...stalePriceCheckout(id) }),
      applySnapshot: createWebhookPersistence().applySnapshot,
      ...checkoutTerms,
    });

    expect(result).toEqual({ ok: true, status: "refused", refusal: "stale_price", effectivePlan: null });
    expect(await readBusiness()).toEqual({ plan: "free" });
    expect(await readSubscription()).toEqual({ status: "pending", grace_period_end: null });
    expect(reportStalePriceCharge).toHaveBeenCalledWith({ businessId, mpPreapprovalId: MP_STALE });
    expect(cancelPreapproval).toHaveBeenCalledWith(MP_STALE);
  });

  it("the webhook that follows closes the cancelled checkout without a grace", async () => {
    const result = await notify(MP_STALE);

    expect(result).toEqual({ ok: true, applied: "closed" });
    expect(await readBusiness()).toEqual({ plan: "free" });
    expect(await readSubscription()).toEqual({ status: "cancelled", grace_period_end: null });
  });
});

describe("checkout paused before it was paid, authorized later at an outdated price", () => {
  const MP_PAUSED = `mp-terms-paused-${stamp}`;

  it("the webhook still checks the terms: the negócio stays on Grátis and the checkout is cancelled", async () => {
    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .insert({ business_id: businessId, mp_preapproval_id: MP_PAUSED, plan: "pro", status: "pending" })
      .select("id")
      .single();
    if (subscriptionError || !subscription) throw new Error(`subscription: ${subscriptionError?.message ?? "no id"}`);
    const { error } = await admin
      .from("businesses")
      .update({ current_subscription_id: subscription.id })
      .eq("id", businessId);
    if (error) throw new Error(`set current: ${error.message}`);

    providerStatus.set(MP_PAUSED, "paused");
    expect(await notify(MP_PAUSED)).toEqual({ ok: true, applied: "closed" });

    providerStatus.set(MP_PAUSED, "authorized");
    const result = await notify(MP_PAUSED);

    expect(result).toEqual({ ok: true, applied: "stale_price" });
    expect(await readBusiness()).toEqual({ plan: "free" });
    expect(reportStalePriceCharge).toHaveBeenCalledWith({ businessId, mpPreapprovalId: MP_PAUSED });
    expect(cancelPreapproval).toHaveBeenCalledWith(MP_PAUSED);
  });
});

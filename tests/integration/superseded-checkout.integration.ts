import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, retryOnFk } from "./index";
import { handleWebhook, type PreapprovalResource } from "@/lib/billing/handle-webhook";
import { createWebhookPersistence } from "@/lib/billing/webhook-server";

// A retry replaces a pending checkout with a new one but leaves the old link
// payable. This drives the webhook decision core with the real persistence
// (service role) and a stubbed Mercado Pago, so the database effects of a paid
// old link, of the superseded-checkout cleanup and of a double charge are
// exercised end-to-end without the provider API.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `superseded.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const MP_OLD = `mp-sup-old-${stamp}`;
const MP_NEW = `mp-sup-new-${stamp}`;
const MP_THIRD = `mp-sup-third-${stamp}`;
const NOW = new Date("2026-10-16T12:00:00.000Z");

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let oldSubscriptionId = "";
let newSubscriptionId = "";

const providerStatus = new Map<string, PreapprovalResource["status"]>();
const cancelPreapproval = vi.fn(async (id: string) => {
  providerStatus.set(id, "cancelled");
});
const reportDoubleCharge = vi.fn();

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
    cancelPreapproval,
    reportDoubleCharge,
    currentPriceCents: 1990,
    reportStalePriceCharge: () => undefined,
    reportUnexpectedTermsCharge: () => undefined,
    now: () => NOW,
  });
}

async function insertPendingSubscription(mpPreapprovalId: string): Promise<string> {
  const { data, error } = await admin
    .from("subscriptions")
    .insert({ business_id: businessId, mp_preapproval_id: mpPreapprovalId, plan: "pro", status: "pending" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`subscription: ${error?.message ?? "no id"}`);
  return data.id;
}

async function readBusiness() {
  const { data, error } = await admin
    .from("businesses")
    .select("plan, current_subscription_id")
    .eq("id", businessId)
    .single();
  if (error) throw new Error(`business read: ${error.message}`);
  return data;
}

async function readSubscription(mpPreapprovalId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("status, grace_period_end")
    .eq("mp_preapproval_id", mpPreapprovalId)
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
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Checkout" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Checkout",
        slug: `agenda-superseded-${stamp}`,
        phone: "+5511944444444",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  });

  // The first checkout, then a retry: the new checkout is the current one.
  oldSubscriptionId = await insertPendingSubscription(MP_OLD);
  newSubscriptionId = await insertPendingSubscription(MP_NEW);
  const { error } = await admin
    .from("businesses")
    .update({ current_subscription_id: newSubscriptionId })
    .eq("id", businessId);
  if (error) throw new Error(`set current: ${error.message}`);
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("superseded checkouts", () => {
  it("a paid old checkout becomes the current assinatura and the replacement is cancelled", async () => {
    providerStatus.set(MP_OLD, "authorized");

    const result = await notify(MP_OLD);

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(await readBusiness()).toEqual({ plan: "pro", current_subscription_id: oldSubscriptionId });
    expect(cancelPreapproval).toHaveBeenCalledTimes(1);
    expect(cancelPreapproval).toHaveBeenCalledWith(MP_NEW);
    expect(reportDoubleCharge).not.toHaveBeenCalled();
  });

  it("the cancelled replacement, never paid, keeps no grace", async () => {
    const result = await notify(MP_NEW);

    expect(result).toEqual({ ok: true, applied: "closed" });
    expect(await readSubscription(MP_NEW)).toEqual({ status: "cancelled", grace_period_end: null });
    expect(await readBusiness()).toEqual({ plan: "pro", current_subscription_id: oldSubscriptionId });
  });

  it("a second paid checkout while the current one is paid is cancelled and reported", async () => {
    await insertPendingSubscription(MP_THIRD);
    providerStatus.set(MP_THIRD, "authorized");
    cancelPreapproval.mockClear();

    const result = await notify(MP_THIRD);

    expect(result).toEqual({ ok: true, applied: "duplicate" });
    expect(await readBusiness()).toEqual({ plan: "pro", current_subscription_id: oldSubscriptionId });
    expect(cancelPreapproval).toHaveBeenCalledWith(MP_THIRD);
    expect(reportDoubleCharge).toHaveBeenCalledWith({ businessId, mpPreapprovalId: MP_THIRD });
  });
});

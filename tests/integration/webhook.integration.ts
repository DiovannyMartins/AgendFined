import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, retryOnFk, SUSPENDED_TRIAL_ENDS_AT } from "./index";
import { handleWebhook } from "@/lib/billing/handle-webhook";
import { createWebhookPersistence } from "@/lib/billing/webhook-server";
import type { PreapprovalResource } from "@/lib/billing/handle-webhook";

// Integration tests for issue #24 (Mercado Pago webhook lifecycle + grace
// period), against the real Supabase project. The pure decision core
// (`handleWebhook`) is driven with the real persistence (`createWebhookPersistence`,
// service-role writes) and a stubbed `getPreapproval`, so the lifecycle is
// exercised end-to-end in the database without hitting the Mercado Pago API:
//   * `authorized` authorizes the subscription, which gives the negócio access;
//   * `paused`/`cancelled` start a 7-day grace, keeping the access;
//   * once the grace expires the negócio is suspended at once, without a cron
//     (ADR 0013; data preserved).
// The negócio's teste grátis is over, so only the assinatura gives access.
// RUN: npm run test:integration.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `webhook.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const MP_ID = `mp-wh-${stamp}`;
// business_has_access() compares the carência with the database's now().
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);
const GRACE_END = new Date(NOW.getTime() + 7 * 86_400_000).toISOString();

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";

function stubPreapproval(status: PreapprovalResource["status"]): PreapprovalResource {
  return {
    status,
    externalReference: businessId,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    transactionAmount: 19.9,
    currencyId: "BRL",
    frequency: 1,
    frequencyType: "months",
  };
}

async function run(event: { type: string; dataId: string }, status: PreapprovalResource["status"]) {
  return handleWebhook({
    event,
    getPreapproval: async () => stubPreapproval(status),
    ...createWebhookPersistence(),
    cancelPreapproval: async () => undefined,
    reportDoubleCharge: () => undefined,
    currentPriceCents: 1990,
    reportStalePriceCharge: () => undefined,
    reportUnexpectedTermsCharge: () => undefined,
    now: () => NOW,
  });
}

async function readAccess(): Promise<boolean> {
  const { data, error } = await admin.rpc("business_has_access", { p_business_id: businessId });
  if (error) throw new Error(`business_has_access: ${error.message}`);
  return data === true;
}

async function readSubscription(): Promise<{ status: string; grace_period_end: string | null } | null> {
  const { data } = await admin.from("subscriptions").select("status, grace_period_end").eq("mp_preapproval_id", MP_ID).maybeSingle();
  return data ?? null;
}

beforeAll(async () => {
  admin = adminClient();
  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = created?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Webhook" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Webhook",
        slug: `agenda-webhook-${stamp}`,
        phone: "+5511987654321",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
        trial_ends_at: SUSPENDED_TRIAL_ENDS_AT,
      })
      .select("*")
      .single();
    if (bizErr) throw new Error(`business insert: ${bizErr.message}`);
    return biz!.id;
  });

  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .insert({
    business_id: businessId,
    mp_preapproval_id: MP_ID,
    status: "pending",
    })
    .select("id")
    .single();
  if (subscriptionError) throw new Error(`subscription insert: ${subscriptionError.message}`);
  if (!subscription) throw new Error("subscription insert did not return an id");

  const { error: currentSubscriptionError } = await admin
    .from("businesses")
    .update({ current_subscription_id: subscription.id })
    .eq("id", businessId);
  if (currentSubscriptionError) {
    throw new Error(`current subscription update: ${currentSubscriptionError.message}`);
  }
});

afterAll(async () => {
  await admin.from("subscriptions").delete().eq("business_id", businessId);
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("issue #24 webhook lifecycle", () => {
  it("authorized gives the negócio access and authorizes the subscription", async () => {
    const result = await run({ type: "subscription_preapproval", dataId: MP_ID }, "authorized");

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(await readAccess()).toBe(true);
    const sub = await readSubscription();
    expect(sub?.status).toBe("authorized");
    expect(sub?.grace_period_end).toBeNull();
  });

  it("paused starts a 7-day grace and keeps the access", async () => {
    const result = await run({ type: "preapproval", dataId: MP_ID }, "paused");

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(await readAccess()).toBe(true);
    const sub = await readSubscription();
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe("paused");
    // Postgres returns timestamptz as `+00:00`; compare the same instant.
    expect(new Date(sub!.grace_period_end!).toISOString()).toBe(GRACE_END);
  });

  it("suspends the negócio as soon as the grace period expires, without a cron (data preserved)", async () => {
    // A far-past date guarantees `grace_period_end < now()` even under clock
    // skew between the test runner and the database.
    await admin
      .from("subscriptions")
      .update({ grace_period_end: new Date("2000-01-01T00:00:00.000Z").toISOString() })
      .eq("mp_preapproval_id", MP_ID);

    expect(await readAccess()).toBe(false);
  });

  it("re-subscribing after the suspension restores the access and clears the grace", async () => {
    const result = await run({ type: "preapproval", dataId: MP_ID }, "authorized");

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(await readAccess()).toBe(true);
    const sub = await readSubscription();
    expect(sub?.status).toBe("authorized");
    expect(sub?.grace_period_end).toBeNull();
  });

  it("cancelled also starts a grace period while keeping the access", async () => {
    const result = await run({ type: "preapproval", dataId: MP_ID }, "cancelled");

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(await readAccess()).toBe(true);
    const sub = await readSubscription();
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe("cancelled");
    expect(new Date(sub!.grace_period_end!).toISOString()).toBe(GRACE_END);
  });

  it("suspends a negócio with a newer pending row once the current grace has lapsed", async () => {
    // A NEWER `pending` row (an abandoned re-subscribe) does not keep the access:
    // the current row is cancelled and its grace is over (#228).
    await admin.from("subscriptions").insert({
      business_id: businessId,
      mp_preapproval_id: `mp-wh-pending-${stamp}`,
      status: "pending",
    });
    await admin
      .from("subscriptions")
      .update({ grace_period_end: new Date("2000-01-01T00:00:00.000Z").toISOString() })
      .eq("mp_preapproval_id", MP_ID);

    expect(await readAccess()).toBe(false);
  });
});

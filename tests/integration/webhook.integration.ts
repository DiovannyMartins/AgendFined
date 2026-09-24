import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, retryOnFk } from "./index";
import { handleWebhook } from "@/lib/billing/handle-webhook";
import { createWebhookPersistence } from "@/lib/billing/webhook-server";
import type { PreapprovalResource } from "@/lib/billing/handle-webhook";

// Integration tests for issue #24 (Mercado Pago webhook lifecycle + grace
// period), against the real Supabase project. The pure decision core
// (`handleWebhook`) is driven with the real persistence (`createWebhookPersistence`,
// service-role writes) and a stubbed `getPreapproval`, so the lifecycle is
// exercised end-to-end in the database without hitting the Mercado Pago API:
//   * `authorized` marks the business Pro and authorizes the subscription;
//   * `paused`/`cancelled` start a 7-day grace, keeping the business Pro;
//   * once the grace expires, `downgrade_expired_subscriptions` drops the
//     business back to Free (data preserved).
// RUN: npm run test:integration.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `webhook.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const MP_ID = `mp-wh-${stamp}`;
const NOW = new Date("2026-09-07T12:00:00.000Z");

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";

function stubPreapproval(status: PreapprovalResource["status"]): PreapprovalResource {
  return {
    status,
    externalReference: businessId,
    currentPeriodStart: null,
    currentPeriodEnd: null,
  };
}

async function run(event: { type: string; dataId: string }, status: PreapprovalResource["status"]) {
  return handleWebhook({
    event,
    getPreapproval: async () => stubPreapproval(status),
    ...createWebhookPersistence(),
    now: () => NOW,
  });
}

async function readBusinessPlan(): Promise<string | null> {
  const { data } = await admin.from("businesses").select("plan").eq("id", businessId).single();
  return data?.plan ?? null;
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
    plan: "pro",
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
  it("authorized marks the business pro and authorizes the subscription", async () => {
    const result = await run({ type: "subscription_preapproval", dataId: MP_ID }, "authorized");

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(await readBusinessPlan()).toBe("pro");
    const sub = await readSubscription();
    expect(sub?.status).toBe("authorized");
    expect(sub?.grace_period_end).toBeNull();
  });

  it("paused starts a 7-day grace and keeps the business pro", async () => {
    const result = await run({ type: "preapproval", dataId: MP_ID }, "paused");

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(await readBusinessPlan()).toBe("pro");
    const sub = await readSubscription();
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe("paused");
    // Postgres returns timestamptz as `+00:00`; compare the same instant.
    expect(new Date(sub!.grace_period_end!).toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });

  it("downgrades the business to free once the grace period expires (data preserved)", async () => {
    // A far-past date guarantees `grace_period_end < now()` even under clock
    // skew between the test runner and the database.
    await admin
      .from("subscriptions")
      .update({ grace_period_end: new Date("2000-01-01T00:00:00.000Z").toISOString() })
      .eq("mp_preapproval_id", MP_ID);

    const { data: count, error } = await admin.rpc("downgrade_expired_subscriptions");
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(0);
    expect(await readBusinessPlan()).toBe("free");
  });

  it("re-subscribing after a downgrade restores pro and clears the grace", async () => {
    const result = await run({ type: "preapproval", dataId: MP_ID }, "authorized");

    expect(result).toEqual({ ok: true, applied: "authorized" });
    expect(await readBusinessPlan()).toBe("pro");
    const sub = await readSubscription();
    expect(sub?.status).toBe("authorized");
    expect(sub?.grace_period_end).toBeNull();
  });

  it("cancelled also starts a grace period while keeping pro", async () => {
    const result = await run({ type: "preapproval", dataId: MP_ID }, "cancelled");

    expect(result).toEqual({ ok: true, applied: "grace" });
    expect(await readBusinessPlan()).toBe("pro");
    const sub = await readSubscription();
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe("cancelled");
    expect(new Date(sub!.grace_period_end!).toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });

  it("downgrades a pro business whose current row is pending and the grace has lapsed", async () => {
    // After a cancelled grace the business is still pro. Insert a NEWER `pending`
    // row (an abandoned re-subscribe) so it becomes the current row, then expire
    // the old cancelled row's grace. The robust downgrade must still drop the
    // business: the current row is not `authorized` and no grace is active.
    await admin.from("subscriptions").insert({
      business_id: businessId,
      mp_preapproval_id: `mp-wh-pending-${stamp}`,
      plan: "pro",
      status: "pending",
    });
    await admin
      .from("subscriptions")
      .update({ grace_period_end: new Date("2000-01-01T00:00:00.000Z").toISOString() })
      .eq("mp_preapproval_id", MP_ID);

    const { data: count, error } = await admin.rpc("downgrade_expired_subscriptions");
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(0);
    expect(await readBusinessPlan()).toBe("free");
  });
});

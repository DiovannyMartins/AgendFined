import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { adminClient, anonClientForUser, retryOnFk } from "./index";
import { getSubscription } from "@/lib/billing/get-subscription";
import { startUpgrade, type StartUpgradeDeps } from "@/lib/billing/start-upgrade";
import type { BillingProvider } from "@/lib/billing/provider";
import type { BillingSubscription } from "@/lib/billing/types";

// Integration tests against the real Supabase project. Issue #23 (dashboard
// "Plano" + upgrade Mercado Pago): the billing seam (`getSubscription`) reads the
// business's `subscriptions` rows through RLS (owner-scoped), and `startUpgrade`
// persists a pending preapproval via the service role. This block verifies
// (a) a fresh business has no subscription, (b) an owner can read their own
// pending subscription, (c) an outsider cannot read another business's
// subscription, and (d) `startUpgrade` persists a pending subscription and
// returns the `init_point`. RUN: npm run test:integration.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `billing.${stamp}@agendfined.dev`;
const OUTSIDER_EMAIL = `billing-out.${stamp}@agendfined.dev`;
const PASSWORD = "senha12345";

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let outsiderId = "";

beforeAll(async () => {
  admin = adminClient();

  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = created?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Billing" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Billing",
        slug: `agenda-billing-${stamp}`,
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

  const { data: out } = await admin.auth.admin.createUser({
    email: OUTSIDER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  outsiderId = out?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: outsiderId, display_name: "Forasteiro" }, { onConflict: "id" });
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(outsiderId).catch(() => undefined);
});

// Build a user-scoped fetchSubscription that mirrors the owner RLS boundary.
function ownerFetch(client: Awaited<ReturnType<typeof anonClientForUser>>) {
  return async (businessId: string): Promise<BillingSubscription | null> => {
    const { data, error } = await client
      .from("subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      mpPreapprovalId: data.mp_preapproval_id,
      status: data.status,
      plan: data.plan,
      currentPeriodStart: data.current_period_start,
      currentPeriodEnd: data.current_period_end,
    };
  };
}

describe("issue #23 billing: assinatura + RLS", () => {
  it("a fresh business has the free plan and no subscription", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const result = await getSubscription(
      { id: businessId, plan: "free" },
      { fetchSubscription: ownerFetch(owner) },
    );
    expect(result.plan).toBe("free");
    expect(result.subscription).toBeNull();
  });

  it("an owner can read their own pending subscription via RLS", async () => {
    await admin.from("subscriptions").insert({
      business_id: businessId,
      mp_preapproval_id: `mp-base-${stamp}`,
      plan: "pro",
      status: "pending",
    });

    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { data, error } = await owner.from("subscriptions").select("*").eq("business_id", businessId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe("pending");
  });

  it("an outsider cannot read another business's subscription (RLS)", async () => {
    const outsider = await anonClientForUser(OUTSIDER_EMAIL, PASSWORD);
    const { data } = await outsider.from("subscriptions").select("*").eq("business_id", businessId);
    expect(data?.length ?? 0).toBe(0);
  });

  it("startUpgrade persists a pending subscription and returns the init_point", async () => {
    const provider: BillingProvider = {
      createPreapproval: vi.fn(async () => ({
        preapprovalId: `mp-up-${stamp}`,
        initPoint: "https://sandbox.mercadopago.com/checkout",
      })),
      getPreapproval: vi.fn(),
      cancelPreapproval: vi.fn(),
    };
    const idempotencyKey = `billing-upgrade-${stamp}`;
    const claimAttempt: StartUpgradeDeps["claimAttempt"] = async (input) => {
      const { data, error } = await admin.rpc("claim_billing_attempt", {
        p_business_id: input.businessId,
        p_kind: input.kind,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return {
        id: data.id,
        businessId: data.business_id,
        kind: data.kind,
        status: data.status,
        idempotencyKey: data.idempotency_key,
        providerPreapprovalId: data.provider_preapproval_id,
      };
    };
    const startAttempt: StartUpgradeDeps["startAttempt"] = async (attemptId, key) => {
      const { data, error } = await admin.rpc("start_billing_attempt", {
        p_attempt_id: attemptId,
        p_idempotency_key: key,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return {
        id: data.id,
        businessId: data.business_id,
        kind: data.kind,
        status: data.status,
        idempotencyKey: data.idempotency_key,
        providerPreapprovalId: data.provider_preapproval_id,
      };
    };
    const finishAttempt = vi.fn<StartUpgradeDeps["finishAttempt"]>(async (input) => {
      const { data, error } = await admin.rpc("finish_billing_attempt", {
        p_attempt_id: input.attemptId,
        p_status: input.status,
        p_provider_preapproval_id: input.providerPreapprovalId ?? null,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BILLING_ATTEMPT_NOT_RETURNED");
      return {
        id: data.id,
        businessId: data.business_id,
        kind: data.kind,
        status: data.status,
        idempotencyKey: data.idempotency_key,
        providerPreapprovalId: data.provider_preapproval_id,
      };
    });
    const linkAttempt: StartUpgradeDeps["linkAttempt"] = async (input) => {
      const { data, error } = await admin.rpc("link_billing_attempt_subscription", {
        p_attempt_id: input.attemptId,
        p_mp_preapproval_id: input.mpPreapprovalId,
        p_status: "pending",
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("SUBSCRIPTION_NOT_RETURNED");
    };

    const result = await startUpgrade({
      business: { id: businessId, plan: "free" },
      provider,
      claimAttempt,
      startAttempt,
      finishAttempt,
      linkAttempt,
      backUrl: "https://app.example/dashboard/configuracoes",
      idempotencyKey,
    });

    expect(result).toEqual({ ok: true, initPoint: "https://sandbox.mercadopago.com/checkout" });
    expect(provider.createPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro" }),
    );

    const preapprovalInput = vi.mocked(provider.createPreapproval).mock.calls[0][0];
    const { data: attempt } = await admin
      .from("billing_attempts")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .single();
    expect(attempt).not.toBeNull();
    expect(preapprovalInput.externalReference).toBe(attempt!.id);

    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { data } = await owner
      .from("subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(data?.status).toBe("pending");
    expect(data?.mp_preapproval_id).toBe(`mp-up-${stamp}`);

    const { data: business } = await admin
      .from("businesses")
      .select("current_subscription_id")
      .eq("id", businessId)
      .single();
    expect(business?.current_subscription_id).toBe(data?.id);

    const { data: linkedAttempt } = await admin
      .from("billing_attempts")
      .select("status, provider_preapproval_id")
      .eq("id", attempt!.id)
      .single();
    expect(linkedAttempt).toEqual({ status: "linked", provider_preapproval_id: `mp-up-${stamp}` });
    expect(finishAttempt).not.toHaveBeenCalled();
  });
});

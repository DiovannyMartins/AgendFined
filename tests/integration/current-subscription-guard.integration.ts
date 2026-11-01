import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClientForUser, retryOnFk, ACTIVE_TRIAL_ENDS_AT } from "./index";

// `businesses.current_subscription_id` decides which assinatura makes the
// negócio PROFISSIONAL when Mercado Pago authorizes it
// (`apply_subscription_snapshot`). Only the billing flows (service role) may
// move it. The owner's browser holds a session JWT and can call PostgREST
// directly, so the database must refuse an owner write on its own.
const stamp = Date.now().toString().slice(-8);
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const EMAIL = `cursub.${stamp}@agendfined.dev`;
const OTHER_EMAIL = `cursub-other.${stamp}@agendfined.dev`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let otherOwnerId = "";
let businessId = "";
let currentSubscriptionId = "";
let olderSubscriptionId = "";

async function createOwner(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data?.user?.id) throw new Error(`owner: ${error?.message ?? "no id"}`);
  const profile = await admin.from("profiles").upsert({ id: data.user.id, display_name: name }, { onConflict: "id" });
  if (profile.error) throw new Error(`profile: ${profile.error.message}`);
  return data.user.id;
}

async function createSubscription(mpPreapprovalId: string): Promise<string> {
  const { data, error } = await admin
    .from("subscriptions")
    .insert({ business_id: businessId, mp_preapproval_id: mpPreapprovalId, plan: "pro", status: "pending" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`subscription: ${error?.message ?? "no id"}`);
  return data.id;
}

async function storedCurrentSubscriptionId(): Promise<string | null> {
  const { data, error } = await admin
    .from("businesses")
    .select("current_subscription_id")
    .eq("id", businessId)
    .single();
  if (error) throw new Error(`business read: ${error.message}`);
  return data.current_subscription_id;
}

beforeAll(async () => {
  admin = adminClient();
  ownerId = await createOwner(EMAIL, "Dono Assinatura");
  otherOwnerId = await createOwner(OTHER_EMAIL, "Outro Dono");

  businessId = await retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Biz Assinatura",
        slug: `biz-cursub-${stamp}`,
        phone: "+5511966666666",
        trial_ends_at: ACTIVE_TRIAL_ENDS_AT,
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  });

  olderSubscriptionId = await createSubscription(`mp-cursub-old-${stamp}`);
  currentSubscriptionId = await createSubscription(`mp-cursub-new-${stamp}`);
  const { error } = await admin
    .from("businesses")
    .update({ current_subscription_id: currentSubscriptionId })
    .eq("id", businessId);
  if (error) throw new Error(`set current: ${error.message}`);
});

afterAll(async () => {
  await admin.from("businesses").delete().in("owner_id", [ownerId, otherOwnerId]);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(otherOwnerId).catch(() => undefined);
});

describe("current_subscription_id is billing-only state", () => {
  it("owner cannot repoint the current subscription to another of their own", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { error } = await owner
      .from("businesses")
      .update({ current_subscription_id: olderSubscriptionId })
      .eq("id", businessId);

    expect(error?.message).toMatch(/CURRENT_SUBSCRIPTION_SELF_SERVE_DISABLED/);
    expect(await storedCurrentSubscriptionId()).toBe(currentSubscriptionId);
  });

  it("owner cannot clear the current subscription", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { error } = await owner
      .from("businesses")
      .update({ current_subscription_id: null })
      .eq("id", businessId);

    expect(error?.message).toMatch(/CURRENT_SUBSCRIPTION_SELF_SERVE_DISABLED/);
    expect(await storedCurrentSubscriptionId()).toBe(currentSubscriptionId);
  });

  it("owner cannot create a negócio that already points at a subscription", async () => {
    const other = await anonClientForUser(OTHER_EMAIL, PASSWORD);
    const { error } = await other.from("businesses").insert({
      owner_id: otherOwnerId,
      name: "Biz Intrusa",
      slug: `biz-cursub-other-${stamp}`,
      phone: "+5511955555555",
      current_subscription_id: currentSubscriptionId,
    });

    expect(error?.message).toMatch(/CURRENT_SUBSCRIPTION_SELF_SERVE_DISABLED/);
  });

  it("owner can still edit the other negócio fields", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { error } = await owner
      .from("businesses")
      .update({ name: "Biz Assinatura Renomeada" })
      .eq("id", businessId);

    expect(error).toBeNull();
    expect(await storedCurrentSubscriptionId()).toBe(currentSubscriptionId);
  });

  it("the billing flows (service role) can still move the current subscription", async () => {
    const { error } = await admin
      .from("businesses")
      .update({ current_subscription_id: olderSubscriptionId })
      .eq("id", businessId);

    expect(error).toBeNull();
    expect(await storedCurrentSubscriptionId()).toBe(olderSubscriptionId);
  });

  it("owner can still delete a negócio that has a current subscription", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { error } = await owner.from("businesses").delete().eq("id", businessId);

    expect(error).toBeNull();
    const { data } = await admin.from("businesses").select("id").eq("id", businessId).maybeSingle();
    expect(data).toBeNull();
  });
});

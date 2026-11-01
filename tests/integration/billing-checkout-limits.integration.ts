import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, retryOnFk } from "./index";
import { countPendingCheckouts } from "@/lib/billing/checkout-limits";

// Every checkout an owner starts costs a Mercado Pago call made with the
// AgendFined credential and leaves a pending row the webhook cleanup and the
// repricing walk through. The limits behind it run against the real database.
const stamp = Date.now().toString().slice(-8);
const PROBE = `probe-${stamp}`;
const EMAIL = `checkout-limits.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";

async function check(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("check_booking_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`rate limit: ${error.message}`);
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
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Limites" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Limites",
        slug: `agenda-checkout-limits-${stamp}`,
        phone: "+5511944444446",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  });
});

afterAll(async () => {
  await admin.from("booking_rate_limits").delete().like("key", `${PROBE}%`);
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("check_booking_rate_limit", () => {
  it("keeps counting a daily window while shorter windows are checked", async () => {
    const daily = `${PROBE}:daily`;
    expect(await check(daily, 2, 86_400)).toBe(true);
    expect(await check(daily, 2, 86_400)).toBe(true);

    // A 15-minute window checked in between, like any login or webhook.
    expect(await check(`${PROBE}:short`, 5, 900)).toBe(true);

    expect(await check(daily, 2, 86_400)).toBe(false);
  });
});

describe("countPendingCheckouts", () => {
  it("counts only the negócio's checkouts still pending", async () => {
    const { error } = await admin.from("subscriptions").insert(
      (["pending", "pending", "cancelled", "authorized"] as const).map((status, index) => ({
        business_id: businessId,
        mp_preapproval_id: `mp-limits-${stamp}-${index}`,
        status,
      })),
    );
    if (error) throw new Error(`subscriptions: ${error.message}`);

    expect(await countPendingCheckouts(admin, businessId)).toBe(2);
  });
});

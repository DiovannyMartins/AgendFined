import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, retryOnFk } from "./index";
import { runPendingCheckoutRepricing } from "@/lib/billing/reprice-checkouts-runner";
import type { Preapproval } from "@/lib/billing/provider";

// Checkouts created before a price change still carry the old amount at
// Mercado Pago. The reconciliation cron runs this repricing over the local
// `pending` subscriptions; here it runs against the real database with a
// stubbed Mercado Pago, so the selection of checkouts and the rotation of the
// batch are exercised end-to-end.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `reprice.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const MP_PENDING = `mp-rep-pending-${stamp}`;
const MP_AUTHORIZED = `mp-rep-authorized-${stamp}`;
const MP_CANCELLED = `mp-rep-cancelled-${stamp}`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";

const getPreapproval = vi.fn(async (id: string): Promise<Preapproval> => ({
  id,
  status: "pending",
  externalReference: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  transactionAmount: 19,
}));
const updatePreapprovalAmount = vi.fn(async () => undefined);
const cancelPreapproval = vi.fn(async () => undefined);

async function insertSubscription(mpPreapprovalId: string, status: "pending" | "authorized" | "cancelled") {
  const { error } = await admin
    .from("subscriptions")
    .insert({ business_id: businessId, mp_preapproval_id: mpPreapprovalId, plan: "pro", status });
  if (error) throw new Error(`subscription: ${error.message}`);
}

async function readUpdatedAt(mpPreapprovalId: string): Promise<string> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("updated_at")
    .eq("mp_preapproval_id", mpPreapprovalId)
    .single();
  if (error) throw new Error(`subscription read: ${error.message}`);
  return data.updated_at;
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
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Reajuste" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Reajuste",
        slug: `agenda-reprice-${stamp}`,
        phone: "+5511933333333",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  });

  await insertSubscription(MP_PENDING, "pending");
  await insertSubscription(MP_AUTHORIZED, "authorized");
  await insertSubscription(MP_CANCELLED, "cancelled");
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("pending checkout repricing (cron)", () => {
  it("reprices only the pending checkouts and moves them to the back of the next batch", async () => {
    const before = await readUpdatedAt(MP_PENDING);

    const result = await runPendingCheckoutRepricing({
      provider: { getPreapproval, updatePreapprovalAmount, cancelPreapproval },
      currentPriceCents: 1990,
      limit: 1000,
    });

    const checkedIds = getPreapproval.mock.calls.map(([id]) => id);
    expect(checkedIds).toContain(MP_PENDING);
    expect(checkedIds).not.toContain(MP_AUTHORIZED);
    expect(checkedIds).not.toContain(MP_CANCELLED);
    expect(updatePreapprovalAmount).toHaveBeenCalledWith(MP_PENDING, 1990);
    expect(result.repriced).toBeGreaterThanOrEqual(1);
    expect(new Date(await readUpdatedAt(MP_PENDING)).getTime()).toBeGreaterThan(new Date(before).getTime());
  });
});

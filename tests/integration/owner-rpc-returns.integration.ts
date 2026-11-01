import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { adminClient, anonClientForUser, retryOnFk, ACTIVE_TRIAL_ENDS_AT } from "./index";
import { futureSlot } from "./future-slot";

// #219: the RPCs the dono calls return only the columns the dono can read with
// the column GRANTs on bookings and waitlist_entries. cancel_token_hash is the
// cliente's capability (ADR 0005) and reminder_claim_token belongs to the
// reminder worker, so neither leaks through a direct PostgREST call.
// RUN: npm run test:integration:local
const stamp = Date.now().toString().slice(-8);
const OWNER_EMAIL = `owner-rpc.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

// Same lists as the column GRANTs (20261027000000 and 20261031010000).
const OWNER_BOOKING_COLUMNS = [
  "id",
  "business_id",
  "service_id",
  "customer_id",
  "customer_name_snapshot",
  "customer_phone_snapshot",
  "customer_email_snapshot",
  "service_name_snapshot",
  "duration_minutes_snapshot",
  "price_cents_snapshot",
  "start_at",
  "end_at",
  "status",
  "public_code",
  "customer_note",
  "cancel_reason",
  "created_at",
  "updated_at",
  "reminder_sent_at",
  "cancel_reason_category",
  "customer_note_category",
  "customer_note_requires_follow_up",
  "reminder_claimed_at",
  "cancelled_by",
  "rescheduled_at",
].sort();
const OWNER_WAITLIST_COLUMNS = [
  "id",
  "business_id",
  "service_id",
  "start_at",
  "customer_name",
  "customer_phone",
  "customer_email",
  "status",
  "created_at",
].sort();

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let serviceId = "";

const digest = () => randomBytes(32).toString("hex");

function expectOwnerColumns(row: unknown, columns: string[]) {
  expect(row).toBeTypeOf("object");
  const keys = Object.keys(row as object);
  expect(keys).not.toContain("cancel_token_hash");
  expect(keys).not.toContain("reminder_claim_token");
  expect(keys.sort()).toEqual(columns);
}

async function joinWaitlist(startAt: string, phone: string): Promise<string> {
  const { data, error } = await admin.rpc("join_waitlist", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: "Maria",
    p_customer_phone: phone,
    p_cancel_token_hash: digest(),
    p_customer_email: `cli.${stamp}@agendfined.dev`,
  });
  expect(error).toBeNull();
  return data!.id;
}

beforeAll(async () => {
  admin = adminClient();
  const { data: created } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = created?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dono" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        trial_ends_at: ACTIVE_TRIAL_ENDS_AT,
        name: "owner-rpc",
        slug: `owner-rpc-${stamp}`,
        phone: "11987654321",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id")
      .single();
    if (error) throw new Error(`business insert: ${error.message}`);
    return data.id;
  });
  const { data: service } = await admin
    .from("services")
    .insert({ business_id: businessId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single();
  serviceId = service!.id;
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("retorno das RPCs do dono (#219)", () => {
  it("create_owner_booking e reschedule_owner_booking não devolvem o digest nem o claim", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);

    const created = await owner.rpc("create_owner_booking", {
      p_service_id: serviceId,
      p_start_at: futureSlot(2, 10),
      p_customer_name: "Bruna Lima",
      p_customer_phone: "11988887777",
      p_cancel_token_hash: digest(),
    });
    expect(created.error).toBeNull();
    expectOwnerColumns(created.data, OWNER_BOOKING_COLUMNS);
    expect(created.data).toMatchObject({ business_id: businessId, status: "confirmed" });

    const moved = await owner.rpc("reschedule_owner_booking", {
      p_booking_id: created.data!.id,
      p_start_at: futureSlot(2, 11),
    });
    expect(moved.error).toBeNull();
    expectOwnerColumns(moved.data, OWNER_BOOKING_COLUMNS);
    expect(moved.data!.id).toBe(created.data!.id);
    expect(new Date(moved.data!.start_at).getTime()).toBe(new Date(futureSlot(2, 11)).getTime());
  });

  it("notify_waitlist_entry e convert_waitlist_entry não devolvem o digest nem o claim", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    const slot = futureSlot(3, 10);
    // The lista de espera only accepts an occupied slot.
    const occupying = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: slot,
      p_customer_name: "Cliente",
      p_customer_phone: "11966665555",
      p_cancel_token_hash: "e".repeat(64),
    });
    expect(occupying.error).toBeNull();
    const entryId = await joinWaitlist(slot, "11977776666");

    const notified = await owner.rpc("notify_waitlist_entry", { p_entry_id: entryId });
    expect(notified.error).toBeNull();
    expectOwnerColumns(notified.data, OWNER_WAITLIST_COLUMNS);
    expect(notified.data).toMatchObject({ id: entryId, status: "notified" });

    const freed = await admin.rpc("cancel_booking_by_public_code", {
      p_code: occupying.data!.public_code,
      p_cancel_token_hash: "e".repeat(64),
    });
    expect(freed.error).toBeNull();

    const converted = await owner.rpc("convert_waitlist_entry", {
      p_entry_id: entryId,
      p_cancel_token_hash: digest(),
    });
    expect(converted.error).toBeNull();
    expectOwnerColumns(converted.data, OWNER_BOOKING_COLUMNS);
    expect(converted.data).toMatchObject({ business_id: businessId, status: "confirmed" });
  });
});

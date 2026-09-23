import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, retryOnFk } from "./index";

// Integration tests against the real Supabase project (§19.2). They verify the
// business-level scheduling seam: the business-level no-overlap exclusion
// constraint on bookings, the block-vs-booking conflict, and that
// `create_booking` binds a reservation to the business with correct snapshots
// and a public_code. RUN: npm run test:integration. Requires .env.local with
// valid keys.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `agenda.${stamp}@agendfined.dev`;
const PASSWORD = "senha12345";
const DISPLAY_NAME = "Dona Ana";

// Far-future instants; a fresh business means no cross-run collisions.
const SLOT_A = "2099-03-01T14:00:00.000Z";
const SLOT_A_END = "2099-03-01T14:30:00.000Z";
const SLOT_A_OVERLAP = "2099-03-01T14:15:00.000Z";
const SLOT_B = "2099-03-01T16:00:00.000Z";
const SLOT_B_OVERLAP = "2099-03-01T16:15:00.000Z";
const SLOT_C = "2099-03-01T18:00:00.000Z";
const SLOT_C_END = "2099-03-01T18:30:00.000Z";
const SLOT_D = "2099-03-02T10:00:00.000Z";
const SLOT_D_END = "2099-03-02T10:30:00.000Z";

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let serviceId = "";
let customerId = "";
let otherOwnerId = "";
let otherBusinessId = "";
let otherServiceId = "";
let otherCustomerId = "";

beforeAll(async () => {
  admin = adminClient();

  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = created?.user?.id ?? "";
  await admin.from("profiles").upsert(
    { id: ownerId, display_name: DISPLAY_NAME },
    { onConflict: "id" },
  );

  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Perfil",
        slug: `agenda-perfil-${stamp}`,
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

  const { data: svc } = await admin
    .from("services")
    .insert({ business_id: businessId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("*")
    .single();
  serviceId = svc!.id;

  const { data: cust } = await admin
    .from("customers")
    .insert({ business_id: businessId, name: "Maria", phone: "+5511944444444" })
    .select("*")
    .single();
  customerId = cust!.id;

  // A second business (owned by another user, so businesses.owner_id stays
  // unique) used to prove business-level scheduling: a booking in a different
  // business can share the same slot.
  const { data: otherCreated } = await admin.auth.admin.createUser({
    email: `other.${stamp}@agendfined.dev`,
    password: PASSWORD,
    email_confirm: true,
  });
  otherOwnerId = otherCreated?.user?.id ?? "";
  await admin.from("profiles").upsert(
    { id: otherOwnerId, display_name: "Outro Dono" },
    { onConflict: "id" },
  );
  otherBusinessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: otherOwnerId,
        name: "Outra Agenda",
        slug: `outra-agenda-${stamp}`,
        phone: "+5511976543210",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("*")
      .single();
    if (bizErr) throw new Error(`other business insert: ${bizErr.message}`);
    return biz!.id;
  });

  const { data: osvc } = await admin
    .from("services")
    .insert({ business_id: otherBusinessId, name: "Corte Outra", duration_minutes: 30, price_cents: 4000 })
    .select("*")
    .single();
  otherServiceId = osvc!.id;

  const { data: ocust } = await admin
    .from("customers")
    .insert({ business_id: otherBusinessId, name: "Maria Outra", phone: "+5511944444445" })
    .select("*")
    .single();
  otherCustomerId = ocust!.id;
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.from("businesses").delete().eq("owner_id", otherOwnerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(otherOwnerId).catch(() => undefined);
});

// Direct booking insert bound to the business (create_booking is exercised
// separately below); this exercises the business-level exclusion constraint.
function bookingInsert(startAt: string, endAt: string, phone: string) {
  return admin
    .from("bookings")
    .insert({
      business_id: businessId,
      service_id: serviceId,
      customer_id: customerId,
      customer_name_snapshot: "Cliente",
      customer_phone_snapshot: phone,
      service_name_snapshot: "Corte",
      duration_minutes_snapshot: 30,
      price_cents_snapshot: 4000,
      start_at: startAt,
      end_at: endAt,
    })
    .select("*")
    .single();
}

describe("T02: agenda por negócio (business-level scheduling)", () => {
  it("two bookings of the same business cannot overlap (business-level exclusion constraint)", async () => {
    const { data: b1, error: e1 } = await bookingInsert(SLOT_A, SLOT_A_END, "+5511951111111");
    expect(e1).toBeNull();
    expect(b1?.business_id).toBe(businessId);

    const { error: e2 } = await bookingInsert(SLOT_A_OVERLAP, SLOT_A_END, "+5511952222222");
    expect(e2).not.toBeNull();
    expect(String(e2?.message).toLowerCase()).toMatch(/overlap|exclusion|conflict|violat/i);
  });

  it("a block overlapping a booking of the same business is rejected", async () => {
    const { error: bookErr } = await bookingInsert(SLOT_C, SLOT_C_END, "+5511955555555");
    expect(bookErr).toBeNull();

    // A block covering that booking must be rejected — overlap is per business.
    const { error } = await admin
      .from("availability_blocks")
      .insert({
        business_id: businessId,
        start_at: "2099-03-01T17:30:00.000Z",
        end_at: "2099-03-01T19:00:00.000Z",
        reason: "pausa",
      });
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/overlap|exclusion|conflict|book|block|violat/i);
  });

  it("a booking in a different business can share the slot", async () => {
    const { data: b1, error: e1 } = await bookingInsert(SLOT_D, SLOT_D_END, "+55119566660001");
    expect(e1).toBeNull();
    expect(b1?.business_id).toBe(businessId);

    const { data: b2, error: e2 } = await admin
      .from("bookings")
      .insert({
        business_id: otherBusinessId,
        service_id: otherServiceId,
        customer_id: otherCustomerId,
        customer_name_snapshot: "Cliente Outra",
        customer_phone_snapshot: "+55119566660002",
        service_name_snapshot: "Corte Outra",
        duration_minutes_snapshot: 30,
        price_cents_snapshot: 4000,
        start_at: SLOT_D,
        end_at: SLOT_D_END,
      })
      .select("*")
      .single();
    expect(e2).toBeNull();
    expect(b2?.business_id).toBe(otherBusinessId);
  });
});

describe("T03: create_booking binds to the business", () => {
  it("rejects an overlapping booking of the same business", async () => {
    const { data: first, error: e1 } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_cancel_token_hash: "a".repeat(64),
      p_service_id: serviceId,
      p_start_at: SLOT_B,
      p_customer_name: "Primeiro",
      p_customer_phone: "+5511953333333",
    });
    expect(e1).toBeNull();
    expect(first?.business_id).toBe(businessId);

    const { error: e2 } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_cancel_token_hash: "a".repeat(64),
      p_service_id: serviceId,
      p_start_at: SLOT_B_OVERLAP,
      p_customer_name: "Conflito",
      p_customer_phone: "+5511954444444",
    });
    expect(e2).not.toBeNull();
    expect(String(e2?.message).toLowerCase()).toMatch(/overlap|already|reserved|exclusion|violat/i);
  });

  it("creates a booking bound to the business, with correct snapshots and public_code", async () => {
    const { data, error } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_cancel_token_hash: "a".repeat(64),
      p_service_id: serviceId,
      p_start_at: "2099-03-03T10:00:00.000Z",
      p_customer_name: "Com Snapshots",
      p_customer_phone: "+55119566660003",
    });
    expect(error).toBeNull();
    expect(data?.business_id).toBe(businessId);
    expect(data?.service_name_snapshot).toBe("Corte");
    expect(data?.duration_minutes_snapshot).toBe(30);
    expect(data?.price_cents_snapshot).toBe(4000);
    expect(data?.public_code).toBeTruthy();
  });
});

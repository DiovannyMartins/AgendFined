import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClientForUser, retryOnFk } from "./index";
import { buildCustomerHistory, filterCustomers } from "@/lib/customers/history";

// Integration tests against the real Supabase project (§19.2). They verify the
// INC-1 seam: the `customers` table is deduplicated by `business_id + phone`
// (create_booking upserts a customer per phone), so a client booking twice is
// ONE customer with TWO bookings in the Clientes history. RUN: npm run
// test:integration (Node 22+). Requires .env.local with valid keys.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `clientes.${stamp}@agendfined.dev`;
const PASSWORD = "senha12345";
const DISPLAY_NAME = "Dona Ana";

const PHONE_ELI = "+5511911110001";
const PHONE_JOANA = "+5511911110002";

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let serviceId = "";

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
        name: "Agenda Clientes",
        slug: `agenda-clientes-${stamp}`,
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
    .select("id")
    .single();
  serviceId = svc!.id;
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

function createBooking(name: string, phone: string, email: string | null, startAt: string) {
  return admin.rpc("create_booking", {
    p_business_id: businessId,
    p_cancel_token_hash: "c".repeat(64),
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: name,
    p_customer_phone: phone,
    p_customer_email: email ?? undefined,
  });
}

describe("INC-1: histórico de clientes (dedup por business_id + phone)", () => {
  // Two bookings by the same phone (same person), one by a different phone.
  const ELI_1 = "2099-06-01T10:00:00.000Z";
  const ELI_2 = "2099-06-01T11:00:00.000Z";
  const JOANA_1 = "2099-06-01T12:00:00.000Z";

  it("a customer is deduplicated: one row per phone, even across repeated bookings", async () => {
    const { error: e1 } = await createBooking("Eli", PHONE_ELI, "eli@ex.com", ELI_1);
    expect(e1).toBeNull();
    const { error: e2 } = await createBooking("Eli", PHONE_ELI, null, ELI_2);
    expect(e2).toBeNull();
    const { error: e3 } = await createBooking("Joana", PHONE_JOANA, "joana@ex.com", JOANA_1);
    expect(e3).toBeNull();

    const { data, error } = await admin
      .from("customers")
      .select("*")
      .eq("business_id", businessId);
    expect(error).toBeNull();
    // Two phones -> two customer rows, not three (the repeated phone collapsed).
    expect(data).toHaveLength(2);
    expect(data?.some((c) => c.phone === PHONE_ELI)).toBe(true);
    expect(data?.some((c) => c.phone === PHONE_JOANA)).toBe(true);
    // The first email survives the coalesce in the second (null-email) upsert.
    expect(data?.find((c) => c.phone === PHONE_ELI)?.email).toBe("eli@ex.com");
  });

  it("buildCustomerHistory groups all bookings under the same customer, newest first", async () => {
    const { data: customers } = await admin
      .from("customers")
      .select("id, name, phone, email")
      .eq("business_id", businessId);
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, customer_id, start_at, status, service_name_snapshot, duration_minutes_snapshot")
      .eq("business_id", businessId);

    const history = buildCustomerHistory(customers ?? [], bookings ?? []);
    expect(history).toHaveLength(2);

    const eli = history.find((h) => h.customer.phone === PHONE_ELI);
    expect(eli).toBeTruthy();
    expect(eli!.bookings).toHaveLength(2);
    // Newest-first timeline (normalise DB "+00:00" offsets to the ISO form).
    expect(new Date(eli!.bookings[0].start_at).toISOString()).toBe(ELI_2);
    expect(new Date(eli!.bookings[1].start_at).toISOString()).toBe(ELI_1);

    const joana = history.find((h) => h.customer.phone === PHONE_JOANA);
    expect(joana!.bookings).toHaveLength(1);
  });

  it("filterCustomers finds a client by phone and hides the other", async () => {
    const { data: customers } = await admin
      .from("customers")
      .select("id, name, phone, email")
      .eq("business_id", businessId);

    const found = filterCustomers(customers ?? [], "1110001");
    expect(found).toHaveLength(1);
    expect(found[0].phone).toBe(PHONE_ELI);
  });

  it("an outsider cannot read this business's customers (RLS)", async () => {
    const OUTSIDER_EMAIL = `outsider.clientes.${stamp}@agendfined.dev`;
    await admin.auth.admin.createUser({ email: OUTSIDER_EMAIL, password: PASSWORD, email_confirm: true });
    const outsider = await anonClientForUser(OUTSIDER_EMAIL, PASSWORD);
    const { data } = await outsider.from("customers").select("id").eq("business_id", businessId);
    expect(data?.length ?? 0).toBe(0);
  });
});

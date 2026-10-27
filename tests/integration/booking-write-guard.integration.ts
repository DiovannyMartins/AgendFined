import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClientForUser, retryOnFk } from "./index";
import { futureSlot } from "./future-slot";

// The owner's browser holds a publishable key and a session JWT, so it can call
// PostgREST directly and skip the Server Actions. The database must therefore
// keep reserva snapshots, reminder state and the status lifecycle intact on its own.
const stamp = Date.now().toString().slice(-8);
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const EMAIL = `guard.${stamp}@agendfined.dev`;
const CUSTOMER_EMAIL = `cli.${stamp}@agendfined.dev`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let serviceId = "";
let bookingId = "";
let hour = 9;

async function createReserva(): Promise<string> {
  const { data, error } = await admin.rpc("create_booking", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: futureSlot(0, hour++),
    p_customer_name: "Cliente Guard",
    p_customer_phone: `+55118${stamp}`,
    p_customer_email: CUSTOMER_EMAIL,
    p_cancel_token_hash: "e".repeat(64),
  });
  if (error || !data?.id) throw new Error(`create_booking: ${error?.message ?? "no id"}`);
  return data.id;
}

// Moves a reserva into the past, as if its atendimento had already started:
// completed and no_show are refused before start_at.
let hoursAgo = 0;
async function startReserva(id: string): Promise<void> {
  const startAt = new Date(Date.now() - (hoursAgo += 2) * 3_600_000);
  const { error } = await admin
    .from("bookings")
    .update({ start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 30 * 60_000).toISOString() })
    .eq("id", id);
  if (error) throw new Error(`startReserva: ${error.message}`);
}

beforeAll(async () => {
  admin = adminClient();
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError || !user?.user?.id) throw new Error(`owner: ${userError?.message ?? "no id"}`);
  ownerId = user.user.id;
  const profile = await admin.from("profiles").upsert({ id: ownerId, display_name: "Dono Guard" }, { onConflict: "id" });
  if (profile.error) throw new Error(`profile: ${profile.error.message}`);

  const { data: business } = await retryOnFk(async () => {
    const result = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Biz Guard",
        slug: `biz-guard-${stamp}`,
        phone: "+5511977777777",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id")
      .single();
    if (result.error) throw result.error;
    return result;
  });
  businessId = business!.id;

  const { data: service, error: serviceError } = await admin
    .from("services")
    .insert({ business_id: businessId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single();
  if (serviceError) throw new Error(`service: ${serviceError.message}`);
  serviceId = service!.id;

  bookingId = await createReserva();
});

afterAll(async () => {
  if (businessId) await admin.from("businesses").delete().eq("id", businessId);
  if (ownerId) await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("owner writes to reservas outside the Server Actions", () => {
  it("cannot rewrite the snapshot or reminder state of their own reserva", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);

    const { error } = await owner
      .from("bookings")
      .update({
        customer_email_snapshot: "victim@example.com",
        price_cents_snapshot: 1,
        reminder_sent_at: null,
      })
      .eq("id", bookingId);
    expect(error).not.toBeNull();

    const { data } = await owner
      .from("bookings")
      .select("customer_email_snapshot, price_cents_snapshot")
      .eq("id", bookingId)
      .single();
    expect(data).toEqual({ customer_email_snapshot: CUSTOMER_EMAIL, price_cents_snapshot: 4000 });
  });

  it("cannot create a reserva without the public booking flow", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { data: customer } = await owner
      .from("customers")
      .select("id")
      .eq("business_id", businessId)
      .limit(1)
      .single();
    const startAt = futureSlot(1, 9);

    const { error } = await owner.from("bookings").insert({
      business_id: businessId,
      service_id: serviceId,
      customer_id: customer!.id,
      public_code: "HJKMNPQR",
      customer_name_snapshot: "Spam",
      customer_phone_snapshot: "+5511900000000",
      customer_email_snapshot: "victim@example.com",
      service_name_snapshot: "Corte",
      duration_minutes_snapshot: 30,
      price_cents_snapshot: 4000,
      start_at: startAt,
      end_at: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(),
    });
    expect(error).not.toBeNull();

    const { count } = await owner
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("start_at", startAt);
    expect(count).toBe(0);
  });

  it("can still finish a confirmed reserva and record the cancellation reason", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const id = await createReserva();

    const { data, error } = await owner
      .from("bookings")
      .update({ status: "cancelled", cancel_reason: "Cliente pediu" })
      .eq("id", id)
      .select("status, cancel_reason");
    expect(error).toBeNull();
    expect(data).toEqual([{ status: "cancelled", cancel_reason: "Cliente pediu" }]);
  });

  // #149: the dashboard cancellation is stamped as the negócio's, and the owner
  // cannot pass it off as the cliente's.
  it("stamps a dashboard cancellation as the negócio's and cannot forge cancelled_by", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const id = await createReserva();

    const forged = await owner.from("bookings").update({ status: "cancelled", cancelled_by: "customer" }).eq("id", id);
    expect(forged.error).not.toBeNull();

    const { data, error } = await owner
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select("status, cancelled_by");
    expect(error).toBeNull();
    expect(data).toEqual([{ status: "cancelled", cancelled_by: "business" }]);
  });

  it("cannot reopen a cancelled reserva", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const id = await createReserva();
    const cancelled = await owner.from("bookings").update({ status: "cancelled" }).eq("id", id);
    expect(cancelled.error).toBeNull();

    const { error } = await owner.from("bookings").update({ status: "confirmed" }).eq("id", id);
    expect(error).not.toBeNull();

    const { data } = await owner.from("bookings").select("status").eq("id", id).single();
    expect(data?.status).toBe("cancelled");
  });

  it("cannot mark a reserva completed or no_show before it starts", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const id = await createReserva();
    for (const status of ["completed", "no_show"] as const) {
      const { error } = await owner.from("bookings").update({ status }).eq("id", id);
      expect(error?.message).toContain("BOOKING_NOT_STARTED");
    }
    const { data } = await owner.from("bookings").select("status").eq("id", id).single();
    expect(data?.status).toBe("confirmed");
  });

  it("can correct completed and no_show into each other, but not reopen them (#145)", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const id = await createReserva();
    await startReserva(id);
    const noShow = await owner.from("bookings").update({ status: "no_show" }).eq("id", id);
    expect(noShow.error).toBeNull();

    const completed = await owner.from("bookings").update({ status: "completed" }).eq("id", id).select("status");
    expect(completed.error).toBeNull();
    expect(completed.data).toEqual([{ status: "completed" }]);

    const backToNoShow = await owner.from("bookings").update({ status: "no_show" }).eq("id", id).select("status");
    expect(backToNoShow.error).toBeNull();
    expect(backToNoShow.data).toEqual([{ status: "no_show" }]);

    for (const status of ["confirmed", "cancelled"] as const) {
      const { error } = await owner.from("bookings").update({ status }).eq("id", id);
      expect(error).not.toBeNull();
    }
    const { data } = await owner.from("bookings").select("status").eq("id", id).single();
    expect(data?.status).toBe("no_show");
  });
});

describe("owner changes to the negócio outside the Server Actions", () => {
  it("cannot change the negócio timezone while reservas are scheduled", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);

    const { error } = await owner
      .from("businesses")
      .update({ timezone: "America/Manaus" })
      .eq("id", businessId);
    expect(error).not.toBeNull();

    const { data } = await owner.from("businesses").select("timezone").eq("id", businessId).single();
    expect(data?.timezone).toBe("America/Sao_Paulo");
  });

  it("can change the negócio timezone once nothing is scheduled", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const cancelled = await owner
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("business_id", businessId)
      .eq("status", "confirmed");
    expect(cancelled.error).toBeNull();

    const { data, error } = await owner
      .from("businesses")
      .update({ timezone: "America/Manaus" })
      .eq("id", businessId)
      .select("timezone");
    expect(error).toBeNull();
    expect(data).toEqual([{ timezone: "America/Manaus" }]);
  });
});

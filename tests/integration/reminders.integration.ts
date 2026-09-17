import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, retryOnFk } from "./index";

// Integration tests against the real Supabase project. INC-2 (reminders):
// `get_due_booking_reminders` is the source of truth for the pg_cron tick — it
// must return exactly the confirmed, future, within-lead, has-e-mail bookings
// that have not yet been reminded, and exclude everything else.
// `set_booking_reminders_sent` then dedups the tick. RUN: npm run test:integration.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `lembrete.${stamp}@agendfined.dev`;
const FREE_EMAIL = `lembrete-free.${stamp}@agendfined.dev`;
const PASSWORD = "senha12345";

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let freeOwnerId = "";
let businessId = "";
let serviceId = "";
let freeBusinessId = "";
let freeServiceId = "";

const now = Date.now();
function iso(offsetMinutes: number): string {
  return new Date(now + offsetMinutes * 60_000).toISOString();
}

// The one booking that SHOULD be due: confirmed, future, within lead, has e-mail.
let dueBookingId = "";
// A due booking on a FREE business that must be excluded by the plan gate.
let freeDueBookingId = "";

async function insertBooking(opts: {
  businessId: string;
  serviceId: string;
  startAt: string;
  phone: string;
  email: string | null;
  status?: "confirmed" | "cancelled";
  reminderSentAt?: string | null;
}) {
  const { data: cust } = await admin
    .from("customers")
    .insert({ business_id: opts.businessId, name: "Cliente", phone: opts.phone, email: opts.email ?? undefined })
    .select("id")
    .single();
  const end = new Date(new Date(opts.startAt).getTime() + 30 * 60_000).toISOString();
  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      business_id: opts.businessId,
      service_id: opts.serviceId,
      customer_id: cust!.id,
      customer_name_snapshot: "Cliente",
      customer_phone_snapshot: opts.phone,
      customer_email_snapshot: opts.email,
      service_name_snapshot: "Corte",
      duration_minutes_snapshot: 30,
      price_cents_snapshot: 4000,
      start_at: opts.startAt,
      end_at: end,
      status: opts.status ?? "confirmed",
      reminder_sent_at: opts.reminderSentAt ?? null,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return booking!.id;
}

beforeAll(async () => {
  admin = adminClient();

  const { data: p, error: ownerAuthError } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (ownerAuthError) throw new Error(`owner auth user: ${ownerAuthError.message}`);
  if (!p.user?.id) throw new Error("owner auth user did not return a user id");
  ownerId = p.user.id;
  const { error: ownerProfileError } = await admin
    .from("profiles")
    .upsert({ id: ownerId, display_name: "Dona Lembrete" }, { onConflict: "id" });
  if (ownerProfileError) throw new Error(`owner profile: ${ownerProfileError.message}`);
  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Lembrete",
        slug: `agenda-lembrete-${stamp}`,
        phone: "+5511987654321",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
        plan: "pro",
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

  // A second owner for the FREE business (a business is owned by exactly one
  // profile, so the free business needs its own owner).
  const { data: fp, error: freeOwnerAuthError } = await admin.auth.admin.createUser({
    email: FREE_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (freeOwnerAuthError) throw new Error(`free owner auth user: ${freeOwnerAuthError.message}`);
  if (!fp.user?.id) throw new Error("free owner auth user did not return a user id");
  freeOwnerId = fp.user.id;
  const { error: freeOwnerProfileError } = await admin
    .from("profiles")
    .upsert({ id: freeOwnerId, display_name: "Dona Grátis" }, { onConflict: "id" });
  if (freeOwnerProfileError) throw new Error(`free owner profile: ${freeOwnerProfileError.message}`);

  // A FREE business (default plan) whose due booking must be excluded by the gate.
  freeBusinessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: freeOwnerId,
        name: "Agenda Grátis",
        slug: `agenda-gratis-${stamp}`,
        phone: "+5511987654322",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("*")
      .single();
    if (bizErr) throw new Error(`free business insert: ${bizErr.message}`);
    return biz!.id;
  });
  const { data: freeSvc } = await admin
    .from("services")
    .insert({ business_id: freeBusinessId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single();
  freeServiceId = freeSvc!.id;

  // Bookings — one per scenario (times spaced >= 60min).
  dueBookingId = await insertBooking({
    businessId,
    serviceId,
    startAt: iso(120), // within lead
    phone: "+5511980000001",
    email: "due@example.com",
  });
  await insertBooking({
    businessId,
    serviceId,
    startAt: iso(180),
    phone: "+5511980000002",
    email: "already@example.com",
    reminderSentAt: new Date(now + 1 * 60_000).toISOString(), // already reminded
  });
  await insertBooking({
    businessId,
    serviceId,
    startAt: iso(1500), // 25h -> beyond the 24h lead
    phone: "+5511980000003",
    email: "beyond@example.com",
  });
  await insertBooking({
    businessId,
    serviceId,
    startAt: iso(240),
    phone: "+5511980000004",
    email: null, // no e-mail
  });
  await insertBooking({
    businessId,
    serviceId,
    startAt: iso(300),
    phone: "+5511980000005",
    email: "cancel@example.com",
    status: "cancelled", // not confirmed
  });

  // A due booking on the FREE business — must be filtered out by the plan gate.
  freeDueBookingId = await insertBooking({
    businessId: freeBusinessId,
    serviceId: freeServiceId,
    startAt: iso(150), // within lead
    phone: "+5511980000099",
    email: "free@example.com",
  });
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.from("businesses").delete().eq("owner_id", freeOwnerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(freeOwnerId).catch(() => undefined);
});

describe("INC-2 lembretes: get_due_booking_reminders", () => {
  it("returns exactly the confirmed, due, has-e-mail, not-yet-reminded booking", async () => {
    const { data, error } = await admin.rpc("get_due_booking_reminders", { p_lead_minutes: 1440 });
    expect(error).toBeNull();
    // The RPC scans ALL businesses (global cron tick), so scope the assertion to
    // this test's business. Without this filter the test would fail in a shared
    // project that holds real data eligible for a reminder (a live reservation).
    const ids = (data ?? [])
      .filter((b) => b.business_id === businessId)
      .map((b) => b.id);
    expect(ids).toContain(dueBookingId);
    // None of the filtered out bookings are present.
    expect(ids).toHaveLength(1);
  });

  it("excludes candidates from non-Pro businesses (plan gate)", async () => {
    const { data } = await admin.rpc("get_due_booking_reminders", { p_lead_minutes: 1440 });
    const ids = (data ?? []).map((b) => b.id);
    expect(ids).not.toContain(freeDueBookingId);
  });

  it("surfaces the fields the reminder e-mail needs", async () => {
    const { data } = await admin.rpc("get_due_booking_reminders", { p_lead_minutes: 1440 });
    const row = data!.find((b) => b.id === dueBookingId)!;
    expect(row.business_name).toBe("Agenda Lembrete");
    expect(row.customer_email_snapshot).toBe("due@example.com");
    expect(row.customer_name_snapshot).toBe("Cliente");
    expect(row.service_name_snapshot).toBe("Corte");
    expect(row.public_code).toBeTruthy();
  });
});

describe("INC-2 lembretes: set_booking_reminders_sent (dedup)", () => {
  it("marks the due booking and removes it from the next tick", async () => {
    const { data: marked, error } = await admin.rpc("set_booking_reminders_sent", { p_booking_ids: [dueBookingId] });
    expect(error).toBeNull();
    expect(marked).toBe(1);

    const { data: due } = await admin.rpc("get_due_booking_reminders", { p_lead_minutes: 1440 });
    expect((due ?? []).map((b) => b.id)).not.toContain(dueBookingId);
  });

  it("is idempotent: marking an already-reminded booking changes nothing", async () => {
    const { data: marked } = await admin.rpc("set_booking_reminders_sent", { p_booking_ids: [dueBookingId] });
    expect(marked).toBe(0);
  });
});

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { adminClient, anonClientForUser, retryOnFk, businessWithAccess, ACTIVE_TRIAL_ENDS_AT, SUSPENDED_TRIAL_ENDS_AT } from "./index";
import { getGcalExport } from "@/lib/gcal/get-export";
import type { FetchGcalBookings, GcalExportBooking } from "@/lib/gcal/export";

// Integration tests against the real Supabase project. INC-3 / US25 (owner
// calendar export): the dashboard reads the owner's bookings via RLS and builds
// an importable .ics feed, gated behind access (ADR 0013). This block
// verifies (a) a suspended business is denied with `access_required` before any
// fetch and (b) a business in teste gets the feed through the user-scoped boundary.
// RUN: npm run test:integration.
const stamp = Date.now().toString().slice(-8);
const FREE_EMAIL = `gcal-free.${stamp}@agendfined.dev`;
const PRO_EMAIL = `gcal-pro.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

let admin: ReturnType<typeof adminClient>;
let freeOwnerId = "";
let freeBusinessId = "";
let proOwnerId = "";
let proBusinessId = "";

beforeAll(async () => {
  admin = adminClient();

  // A suspended business (teste ended) whose export the gate must deny.
  const { data: free } = await admin.auth.admin.createUser({
    email: FREE_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  freeOwnerId = free?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: freeOwnerId, display_name: "Dona Grátis" }, { onConflict: "id" });
  freeBusinessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: freeOwnerId,
        name: "Agenda Grátis",
        slug: `gcal-free-${stamp}`,
        phone: "+5511987654321",
        trial_ends_at: SUSPENDED_TRIAL_ENDS_AT,
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("*")
      .single();
    if (bizErr) throw new Error(`free business insert: ${bizErr.message}`);
    return biz!.id;
  });

  // A PRO business whose upcoming confirmed booking the gate must let through.
  const { data: pro } = await admin.auth.admin.createUser({
    email: PRO_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  proOwnerId = pro?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: proOwnerId, display_name: "Dona Pro" }, { onConflict: "id" });
  proBusinessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: proOwnerId,
        name: "Agenda Pro",
        slug: `gcal-pro-${stamp}`,
        phone: "+5511987654323",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
        trial_ends_at: ACTIVE_TRIAL_ENDS_AT,
      })
      .select("*")
      .single();
    if (bizErr) throw new Error(`pro business insert: ${bizErr.message}`);
    return biz!.id;
  });

  const { data: svc } = await admin
    .from("services")
    .insert({ business_id: proBusinessId, name: "Corte Pro", duration_minutes: 30, price_cents: 5000 })
    .select("id")
    .single();
  const { data: cust } = await admin
    .from("customers")
    .insert({ business_id: proBusinessId, name: "Cliente", phone: "+5511990000001" })
    .select("id")
    .single();

  // One confirmed, future booking (the next 24h) that should appear in the feed.
  const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
  const { error: bookErr } = await admin
    .from("bookings")
    .insert({
      business_id: proBusinessId,
      service_id: svc!.id,
      customer_id: cust!.id,
      customer_name_snapshot: "Cliente",
      customer_phone_snapshot: "+5511990000001",
      service_name_snapshot: "Corte Pro",
      duration_minutes_snapshot: 30,
      price_cents_snapshot: 5000,
      start_at: startAt,
      end_at: endAt,
      status: "confirmed",
    })
    .select("id")
    .single();
  expect(bookErr).toBeNull();
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", freeOwnerId);
  await admin.from("businesses").delete().eq("owner_id", proOwnerId);
  await admin.auth.admin.deleteUser(freeOwnerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(proOwnerId).catch(() => undefined);
});

describe("INC-3 exportação de agenda: gate de acesso (suspenso negado, em teste liberado)", () => {
  it("denies a suspended business with access_required before any fetch", async () => {
    expect((await businessWithAccess(freeBusinessId)).has_access).toBe(false);

    const fetchSpy = vi.fn<FetchGcalBookings>(async () => []);
    const result = await getGcalExport({
      getBusiness: () => businessWithAccess(freeBusinessId),
      fetchBookings: fetchSpy,
    });
    expect(result).toEqual({ status: "access_required" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets a business in teste export the agenda through the user-scoped boundary", async () => {
    expect((await businessWithAccess(proBusinessId)).has_access).toBe(true);

    const proOwner = await anonClientForUser(PRO_EMAIL, PASSWORD);
    const result = await getGcalExport({
      getBusiness: () => businessWithAccess(proBusinessId),
      fetchBookings: async (businessId) => {
        const { data, error } = await proOwner
          .from("bookings")
          .select("id, status, start_at, end_at, service_name_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_note")
          .eq("business_id", businessId);
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as GcalExportBooking[];
      },
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.count).toBe(1);
      expect(result.icsFeed).toContain("BEGIN:VCALENDAR");
      expect(result.icsFeed).toContain("END:VCALENDAR");
      expect(result.icsFeed).toContain("SUMMARY:Corte Pro — Cliente");
      expect(result.icsFeed).toContain("Telefone: (11) 99000-0001");
    }
  });
});

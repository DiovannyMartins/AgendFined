import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { adminClient, anonClientForUser, retryOnFk } from "./index";
import { getGcalExport } from "@/lib/gcal/get-export";
import type { FetchGcalBookings, GcalExportBooking } from "@/lib/gcal/export";

// Integration tests against the real Supabase project. INC-3 / US25 (owner
// calendar export): the dashboard reads the owner's bookings via RLS and builds
// an importable .ics feed, gated behind the PROFISSIONAL plan. This block
// verifies (a) a Free business is denied with `upgrade_required` before any
// fetch and (b) a Pro business gets the feed through the user-scoped boundary.
// RUN: npm run test:integration.
const stamp = Date.now().toString().slice(-8);
const FREE_EMAIL = `gcal-free.${stamp}@agendfined.dev`;
const PRO_EMAIL = `gcal-pro.${stamp}@agendfined.dev`;
const PASSWORD = "senha12345";

let admin: ReturnType<typeof adminClient>;
let freeOwnerId = "";
let freeBusinessId = "";
let proOwnerId = "";
let proBusinessId = "";

beforeAll(async () => {
  admin = adminClient();

  // A FREE business (default plan) whose export the gate must deny.
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
        plan: "pro",
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

describe("INC-3 exportação de agenda: gate de plano (free negado, pro liberado)", () => {
  it("denies a Free business with upgrade_required before any fetch", async () => {
    const { data: freeBiz } = await admin
      .from("businesses")
      .select("id, plan")
      .eq("id", freeBusinessId)
      .single();
    expect(freeBiz?.plan).toBe("free");

    const fetchSpy = vi.fn<FetchGcalBookings>(async () => []);
    const result = await getGcalExport({
      getBusiness: async () => ({ id: freeBusinessId, plan: "free" }),
      fetchBookings: fetchSpy,
    });
    expect(result).toEqual({ status: "upgrade_required" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets a Pro business export the agenda through the user-scoped boundary", async () => {
    const { data: proBiz } = await admin
      .from("businesses")
      .select("id, plan")
      .eq("id", proBusinessId)
      .single();
    expect(proBiz?.plan).toBe("pro");

    const proOwner = await anonClientForUser(PRO_EMAIL, PASSWORD);
    const result = await getGcalExport({
      getBusiness: async () => ({ id: proBusinessId, plan: "pro" }),
      fetchBookings: async (businessId) => {
        const { data, error } = await proOwner
          .from("bookings")
          .select("id, status, start_at, end_at, service_name_snapshot")
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
      expect(result.icsFeed).toContain("SUMMARY:Corte Pro");
    }
  });
});

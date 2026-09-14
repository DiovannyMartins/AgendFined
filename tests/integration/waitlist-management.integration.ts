import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { adminClient, anonClientForUser, retryOnFk } from "./index";
import {
  buildWaitlistManagementResult,
  type FetchWaitlistEntries,
  type ManageWaitlistEntry,
} from "@/lib/waitlist/manage";

// Integration tests against the real Supabase project for issue #22 (waitlist
// management, PROFESSIONAL). The dashboard boundary must deny a Free business and
// let a Pro business through, the owner-scoped notify/convert RPCs must work for
// the owner, and an outsider must be denied. The public join stays free (covered
// by cancel-waitlist.integration.ts); here we validate the management side.
// RUN: npm run test:integration (requires the 0036 migration pushed).
const stamp = Date.now().toString().slice(-8);
const FREE_EMAIL = `wl-free.${stamp}@agendfined.dev`;
const PRO_EMAIL = `wl-pro.${stamp}@agendfined.dev`;
const OUTSIDER_EMAIL = `wl-out.${stamp}@agendfined.dev`;
const PASSWORD = "senha12345";

const SLOT = "2099-01-07T14:00:00.000Z";
const SLOT_CONVERT = "2099-01-07T15:00:00.000Z";

let admin: ReturnType<typeof adminClient>;
let freeOwnerId = "";
let freeBusinessId = "";
let proOwnerId = "";
let proBusinessId = "";
let proServiceId = "";
let outsiderOwnerId = "";

async function createBusiness(ownerId: string, name: string, plan: "free" | "pro"): Promise<string> {
  return retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}`,
        phone: "+5511987654321",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
        ...(plan === "pro" ? { plan: "pro" } : {}),
      })
      .select("*")
      .single();
    if (bizErr) throw new Error(`business insert: ${bizErr.message}`);
    return biz!.id;
  });
}

async function createService(businessId: string, name: string): Promise<string> {
  const { data: svc } = await admin
    .from("services")
    .insert({ business_id: businessId, name, duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single();
  return svc!.id;
}

async function createBookingAt(businessId: string, serviceId: string, startAt: string, phone: string) {
  const { data, error } = await admin.rpc("create_booking", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: "Cliente",
    p_customer_phone: phone,
    p_customer_email: `cli.${stamp}@agendfined.dev`,
  });
  expect(error).toBeNull();
  return data!;
}

async function joinWaitlist(businessId: string, serviceId: string, startAt: string, phone: string, name = "Maria") {
  const { data, error } = await admin.rpc("join_waitlist", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: name,
    p_customer_phone: phone,
    p_customer_email: `cli.${stamp}@agendfined.dev`,
  });
  expect(error).toBeNull();
  return data!;
}

async function createUser(email: string, displayName: string): Promise<string> {
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  const id = created?.user?.id ?? "";
  await admin.from("profiles").upsert({ id, display_name: displayName }, { onConflict: "id" });
  return id;
}

beforeAll(async () => {
  admin = adminClient();

  // Free business with a waitlist entry (the boundary must deny it anyway).
  freeOwnerId = await createUser(FREE_EMAIL, "Dona Free");
  freeBusinessId = await createBusiness(freeOwnerId, "Agenda Free", "free");
  const freeServiceId = await createService(freeBusinessId, "Corte");
  await createBookingAt(freeBusinessId, freeServiceId, SLOT, "+5511981110001");
  await joinWaitlist(freeBusinessId, freeServiceId, SLOT, "+5511981110002");

  // Pro business with two slots: one for the notify test (stays occupied) and one
  // whose occupying booking is cancelled so the convert test can create a booking.
  proOwnerId = await createUser(PRO_EMAIL, "Dona Pro");
  proBusinessId = await createBusiness(proOwnerId, "Agenda Pro", "pro");
  proServiceId = await createService(proBusinessId, "Corte");
  await createBookingAt(proBusinessId, proServiceId, SLOT, "+5511982220001");
  await joinWaitlist(proBusinessId, proServiceId, SLOT, "+5511982220002");
  const convertBooking = await createBookingAt(proBusinessId, proServiceId, SLOT_CONVERT, "+5511982220003");
  await joinWaitlist(proBusinessId, proServiceId, SLOT_CONVERT, "+5511982220004", "Joana");
  // Free the SLOT_CONVERT slot so the convert RPC can create a booking there.
  const { error: cancelErr } = await admin.rpc("cancel_booking_by_public_code", {
    p_code: convertBooking.public_code,
  });
  expect(cancelErr).toBeNull();

  // An outsider with their own business (must not manage someone else's waitlist).
  outsiderOwnerId = await createUser(OUTSIDER_EMAIL, "Forasteiro");
  await createBusiness(outsiderOwnerId, "Alheia", "free");
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", freeOwnerId);
  await admin.from("businesses").delete().eq("owner_id", proOwnerId);
  await admin.from("businesses").delete().eq("owner_id", outsiderOwnerId);
  await admin.auth.admin.deleteUser(freeOwnerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(proOwnerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(outsiderOwnerId).catch(() => undefined);
});

// A fetch that reads the owner's waitlist + services through RLS and maps them to
// the management entry shape (mirrors lib/waitlist/get-management.ts).
function ownerFetch(email: string, password: string): FetchWaitlistEntries {
  return async (businessId: string) => {
    const owner = await anonClientForUser(email, password);
    const [{ data: entries }, { data: services }] = await Promise.all([
      owner.from("waitlist_entries").select("*").eq("business_id", businessId),
      owner.from("services").select("id, name").eq("business_id", businessId),
    ]);
    const names = new Map((services ?? []).map((s) => [s.id, s.name]));
    return (entries ?? []).map((e) => ({
      ...e,
      service_name: names.get(e.service_id) ?? "Serviço",
    })) as ManageWaitlistEntry[];
  };
}

describe("issue #22: waitlist management gate (free negado, pro liberado)", () => {
  it("denies a Free business with upgrade_required before any fetch", async () => {
    const fetchSpy = vi.fn<FetchWaitlistEntries>(async () => []);
    const result = await buildWaitlistManagementResult(
      { id: freeBusinessId, plan: "free" },
      fetchSpy,
    );
    expect(result).toEqual({ status: "upgrade_required" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets a Pro business see its waitlist through the user-scoped boundary (RLS)", async () => {
    const result = await buildWaitlistManagementResult(
      { id: proBusinessId, plan: "pro" },
      ownerFetch(PRO_EMAIL, PASSWORD),
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const phones = result.entries.map((e) => e.customer_phone);
      expect(phones).toContain("+5511982220002");
      expect(phones).toContain("+5511982220004");
      expect(result.entries.every((e) => e.service_name === "Corte")).toBe(true);
    }
  });

  it("the public join stays free (a Free business can still hold waitlist entries)", async () => {
    const { data } = await admin
      .from("waitlist_entries")
      .select("id")
      .eq("business_id", freeBusinessId);
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("issue #22: owner-scoped notify/convert RPCs", () => {
  it("the owner can notify a pending entry", async () => {
    const pro = await anonClientForUser(PRO_EMAIL, PASSWORD);
    const { data: entry } = await pro
      .from("waitlist_entries")
      .select("id")
      .eq("business_id", proBusinessId)
      .eq("customer_phone", "+5511982220002")
      .single();
    expect(entry).toBeTruthy();

    const { data, error } = await pro.rpc("notify_waitlist_entry", { p_entry_id: entry!.id });
    expect(error).toBeNull();
    expect(data?.status).toBe("notified");
  });

  it("the owner can convert an entry to a booking once its slot is free", async () => {
    const pro = await anonClientForUser(PRO_EMAIL, PASSWORD);
    const { data: entry } = await pro
      .from("waitlist_entries")
      .select("id")
      .eq("business_id", proBusinessId)
      .eq("customer_phone", "+5511982220004")
      .single();
    expect(entry).toBeTruthy();

    const { data, error } = await pro.rpc("convert_waitlist_entry", { p_entry_id: entry!.id });
    expect(error).toBeNull();
    expect(data?.status).toBe("confirmed");
    expect(data?.customer_phone_snapshot).toBe("+5511982220004");

    const { data: after } = await pro
      .from("waitlist_entries")
      .select("status")
      .eq("id", entry!.id)
      .single();
    expect(after?.status).toBe("converted");
  });

  it("an outsider cannot notify or convert another business's entry", async () => {
    const pro = await anonClientForUser(PRO_EMAIL, PASSWORD);
    const { data: entry } = await pro
      .from("waitlist_entries")
      .select("id")
      .eq("business_id", proBusinessId)
      .eq("customer_phone", "+5511982220002")
      .single();
    expect(entry).toBeTruthy();

    const outsider = await anonClientForUser(OUTSIDER_EMAIL, PASSWORD);
    const notify = await outsider.rpc("notify_waitlist_entry", { p_entry_id: entry!.id });
    expect(notify.error).not.toBeNull();
    expect(String(notify.error?.message)).toMatch(/NOT_OWNER|NOT_FOUND/i);

    const convert = await outsider.rpc("convert_waitlist_entry", { p_entry_id: entry!.id });
    expect(convert.error).not.toBeNull();
    expect(String(convert.error?.message)).toMatch(/NOT_OWNER|NOT_FOUND/i);
  });

  it("a Free business is denied by the RPCs (pro gate is fail-closed at the API)", async () => {
    const free = await anonClientForUser(FREE_EMAIL, PASSWORD);
    const { data: entry } = await free
      .from("waitlist_entries")
      .select("id")
      .eq("business_id", freeBusinessId)
      .eq("customer_phone", "+5511981110002")
      .single();
    expect(entry).toBeTruthy();

    const notify = await free.rpc("notify_waitlist_entry", { p_entry_id: entry!.id });
    expect(notify.error).not.toBeNull();
    expect(String(notify.error?.message)).toMatch(/PRO_REQUIRED/i);

    const convert = await free.rpc("convert_waitlist_entry", { p_entry_id: entry!.id });
    expect(convert.error).not.toBeNull();
    expect(String(convert.error?.message)).toMatch(/PRO_REQUIRED/i);
  });

  it("anon cannot execute the notify/convert RPCs directly", async () => {
    const { anonClient } = await import("./index");
    const anon = anonClient();
    const notify = await anon.rpc("notify_waitlist_entry", { p_entry_id: "00000000-0000-0000-0000-000000000000" });
    expect(notify.error).not.toBeNull();
    const convert = await anon.rpc("convert_waitlist_entry", { p_entry_id: "00000000-0000-0000-0000-000000000000" });
    expect(convert.error).not.toBeNull();
  });
});

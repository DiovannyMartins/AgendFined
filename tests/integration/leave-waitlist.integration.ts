import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { adminClient, anonClient, retryOnFk } from "./index";
import { futureSlot } from "./future-slot";

// #152: self-service exit from the lista de espera. The token itself is
// generated and hashed app-side (lib/bookings/cancel.ts, unit-tested); here we
// exercise the database seam the server actions call:
//   * join_waitlist — stores the capability digest (rotated on dedup),
//   * cancel_waitlist_entry_by_token — digest check + pending/notified ->
//     cancelled in one locked transaction, generic rejection otherwise,
// and that only the service role can call it.
// RUN: npm run test:integration:local
const stamp = Date.now().toString().slice(-8);
const EMAIL = `sair.espera.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let serviceId = "";

// Kept occupied by a confirmed reserva: the lista de espera only takes an
// occupied horário.
const SLOT = futureSlot(1, 10);
const tokenHash = () => randomBytes(32).toString("hex");

async function joinWaitlist(phone: string, hash: string) {
  const { data, error } = await admin.rpc("join_waitlist", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: SLOT,
    p_customer_name: "Maria",
    p_customer_phone: phone,
    p_cancel_token_hash: hash,
    p_customer_email: `cli.${stamp}@agendfined.dev`,
  });
  expect(error).toBeNull();
  return data!;
}

async function statusOf(entryId: string) {
  const { data } = await admin.from("waitlist_entries").select("status").eq("id", entryId).single();
  return data?.status;
}

beforeAll(async () => {
  admin = adminClient();

  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = created?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Lista" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Lista de Espera",
        slug: `agenda-sair-espera-${stamp}`,
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

  const { error } = await admin.rpc("create_booking", {
    p_business_id: businessId,
    p_cancel_token_hash: tokenHash(),
    p_service_id: serviceId,
    p_start_at: SLOT,
    p_customer_name: "Cliente",
    p_customer_phone: "+5511980000099",
    p_customer_email: `cli.${stamp}@agendfined.dev`,
  });
  expect(error).toBeNull();
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("join_waitlist capability (#152)", () => {
  it("stores only the digest it was given", async () => {
    const hash = tokenHash();
    const entry = await joinWaitlist("+5511980000020", hash);
    expect(entry.cancel_token_hash).toBe(hash);
  });

  it("refuses a malformed digest", async () => {
    const { error } = await admin.rpc("join_waitlist", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: SLOT,
      p_customer_name: "Maria",
      p_customer_phone: "+5511980000021",
      p_cancel_token_hash: "not-a-digest",
    });
    expect(String(error?.message)).toContain("INVALID_CANCEL_TOKEN_HASH");
  });

  // Deploy window: the app version before #152 calls join_waitlist without a
  // digest. It still joins, and a rejoin from it keeps the existing link valid.
  it("still accepts a call without a digest, keeping the one already stored", async () => {
    const hash = tokenHash();
    const first = await joinWaitlist("+5511980000023", hash);
    const { data, error } = await admin.rpc("join_waitlist", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: SLOT,
      p_customer_name: "Maria",
      p_customer_phone: "+5511980000023",
    });
    expect(error).toBeNull();
    expect(data?.id).toBe(first.id);
    expect(data?.cancel_token_hash).toBe(hash);
  });

  it("joining the same horário again rotates the digest: only the newest link works", async () => {
    const oldHash = tokenHash();
    const newHash = tokenHash();
    const first = await joinWaitlist("+5511980000022", oldHash);
    const second = await joinWaitlist("+5511980000022", newHash);
    expect(second.id).toBe(first.id);

    const stale = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: oldHash });
    expect(String(stale.error?.message)).toContain("WAITLIST_CANCELLATION_REJECTED");
    expect(await statusOf(first.id)).toBe("pending");

    const fresh = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: newHash });
    expect(fresh.error).toBeNull();
    expect(await statusOf(first.id)).toBe("cancelled");
  });
});

describe("cancel_waitlist_entry_by_token (#152)", () => {
  it("moves a pending entrada to cancelled", async () => {
    const hash = tokenHash();
    const entry = await joinWaitlist("+5511980000030", hash);

    const { data, error } = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: hash });
    expect(error).toBeNull();
    expect(data?.id).toBe(entry.id);
    expect(data?.status).toBe("cancelled");
  });

  it("moves a notified entrada to cancelled", async () => {
    const hash = tokenHash();
    const entry = await joinWaitlist("+5511980000031", hash);
    await admin.from("waitlist_entries").update({ status: "notified" }).eq("id", entry.id);

    const { error } = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: hash });
    expect(error).toBeNull();
    expect(await statusOf(entry.id)).toBe("cancelled");
  });

  it("answers an entrada already cancelled or converted with the generic rejection", async () => {
    const cancelledHash = tokenHash();
    const cancelled = await joinWaitlist("+5511980000032", cancelledHash);
    await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: cancelledHash });
    const again = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: cancelledHash });
    expect(String(again.error?.message)).toContain("WAITLIST_CANCELLATION_REJECTED");
    expect(await statusOf(cancelled.id)).toBe("cancelled");

    const convertedHash = tokenHash();
    const converted = await joinWaitlist("+5511980000033", convertedHash);
    await admin.from("waitlist_entries").update({ status: "converted" }).eq("id", converted.id);
    const { error } = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: convertedHash });
    expect(String(error?.message)).toContain("WAITLIST_CANCELLATION_REJECTED");
    expect(await statusOf(converted.id)).toBe("converted");
  });

  it("answers an unknown or malformed digest with the same generic rejection", async () => {
    const unknown = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: tokenHash() });
    expect(String(unknown.error?.message)).toContain("WAITLIST_CANCELLATION_REJECTED");

    const malformed = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: "x" });
    expect(String(malformed.error?.message)).toContain("WAITLIST_CANCELLATION_REJECTED");
  });

  it("anon CANNOT execute the leave RPC directly", async () => {
    const hash = tokenHash();
    const entry = await joinWaitlist("+5511980000034", hash);

    const { error } = await anonClient().rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: hash });
    expect(error).not.toBeNull();
    expect(await statusOf(entry.id)).toBe("pending");
  });
});

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { adminClient, anonClient, anonClientForUser, retryOnFk, ACTIVE_TRIAL_ENDS_AT } from "./index";
import { futureSlot } from "./future-slot";

// Integration tests against the real Supabase project (§19.2) for INC-3:
// self-service cancellation + waitlist. The derived cancellation *token* is
// verified app-side (lib/bookings/cancel.ts, unit-tested); here we exercise the
// database seam the server action calls:
//   * cancel_booking_by_public_code — atomic confirmed -> cancelled,
//   * join_waitlist — validated insert with dedup + future-slot guard,
//   * get_waitlist_for_slot — pending entries for a freed slot,
// and the RLS/privilege posture of both.
// RUN: npm run test:integration (requires the 0030 migration pushed).
const stamp = Date.now().toString().slice(-8);
const EMAIL = `cancel.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let serviceId = "";

const SLOT = futureSlot(0, 14);
const SLOT_2 = futureSlot(0, 15);
// A slot that remains occupied for the waitlist tests (a waitlist is only for an
// occupied slot — a free slot should just be booked).
const SLOT_WAIT = futureSlot(0, 16);
const CANCEL_TOKEN_HASH = "f".repeat(64);
// Each lista de espera entrada needs its own digest (unique index).
const waitlistTokenHash = () => randomBytes(32).toString("hex");

async function createBookingAt(startAt: string, phone: string) {
  const { data, error } = await admin.rpc("create_booking", {
    p_business_id: businessId,
    p_cancel_token_hash: CANCEL_TOKEN_HASH,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: "Cliente",
    p_customer_phone: phone,
    p_customer_email: `cli.${stamp}@agendfined.dev`,
  });
  expect(error).toBeNull();
  return data!;
}

beforeAll(async () => {
  admin = adminClient();

  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = created?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dona Cancelamento" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        trial_ends_at: ACTIVE_TRIAL_ENDS_AT,
        name: "Agenda Cancelamento",
        slug: `agenda-cancelamento-${stamp}`,
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

  // A confirmed booking that keeps SLOT_WAIT occupied for the waitlist tests.
  await createBookingAt(SLOT_WAIT, "+5511980000099");
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("cancel_booking_by_public_code (INC-3)", () => {
  it("cancels a confirmed booking and frees the slot for a new reservation", async () => {
    const booking = await createBookingAt(SLOT, "+5511980000001");
    const { data, error } = await admin.rpc("cancel_booking_by_public_code", {
      p_code: booking.public_code,
      p_cancel_token_hash: CANCEL_TOKEN_HASH,
      p_cancel_reason: "Não vou mais poder ir",
    });
    expect(error).toBeNull();
    expect(data?.status).toBe("cancelled");
    expect(data?.cancel_reason).toBe("Não vou mais poder ir");
    // #149: the agenda tells a cancellation by the cliente apart.
    expect(data?.cancelled_by).toBe("customer");
    // The freed slot can now be booked again at the same instant.
    const second = await createBookingAt(SLOT, "+5511980000002");
    expect(second.status).toBe("confirmed");
    // And the cancelled original is still present (never deleted), and the
    // public lookup reports it as cancelled (#110).
    const { data: row } = await admin.rpc("get_booking_by_public_code", { p_code: booking.public_code });
    expect(row?.[0]).toBeDefined();
    expect(row?.[0]?.status).toBe("cancelled");
  });

  it("rejects cancelling a booking that is no longer confirmed", async () => {
    const booking = await createBookingAt(SLOT_2, "+5511980000003");
    await admin.rpc("cancel_booking_by_public_code", {
      p_code: booking.public_code,
      p_cancel_token_hash: CANCEL_TOKEN_HASH,
    });
    const { error } = await admin.rpc("cancel_booking_by_public_code", {
      p_code: booking.public_code,
      p_cancel_token_hash: CANCEL_TOKEN_HASH,
    });
    expect(error).not.toBeNull();
    expect(String(error?.message)).toContain("CANCELLATION_REJECTED");
  });

  it("rejects cancelling a non-existent public code", async () => {
    const { error } = await admin.rpc("cancel_booking_by_public_code", {
      p_code: "ZZZZZZZZ",
      p_cancel_token_hash: CANCEL_TOKEN_HASH,
    });
    expect(error).not.toBeNull();
    expect(String(error?.message)).toContain("CANCELLATION_REJECTED");
  });

  it("rejects a valid public code with the wrong private capability", async () => {
    const booking = await createBookingAt(futureSlot(0, 15, 30), "+5511980000004");
    const { error } = await admin.rpc("cancel_booking_by_public_code", {
      p_code: booking.public_code,
      p_cancel_token_hash: "0".repeat(64),
    });
    expect(error).not.toBeNull();
    expect(String(error?.message)).toContain("CANCELLATION_REJECTED");

    const { data: row } = await admin.from("bookings").select("status").eq("id", booking.id).single();
    expect(row?.status).toBe("confirmed");
  });

  // A cliente who missed the visit must not erase the no-show by cancelling
  // afterwards (#141). Only the token holder learns the reserva has started.
  it("rejects cancelling a booking that has already started, keeping it confirmed", async () => {
    const booking = await createBookingAt(futureSlot(0, 17), "+5511980000005");
    const startAt = new Date(Date.now() - 60 * 60_000);
    const { error: moveError } = await admin
      .from("bookings")
      .update({ start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 30 * 60_000).toISOString() })
      .eq("id", booking.id);
    expect(moveError).toBeNull();

    const { error } = await admin.rpc("cancel_booking_by_public_code", {
      p_code: booking.public_code,
      p_cancel_token_hash: CANCEL_TOKEN_HASH,
      p_cancel_reason: "Esqueci",
    });
    expect(error).not.toBeNull();
    expect(String(error?.message)).toContain("BOOKING_ALREADY_STARTED");

    const { data: row } = await admin.from("bookings").select("status, cancel_reason").eq("id", booking.id).single();
    expect(row).toEqual({ status: "confirmed", cancel_reason: null });
  });

  it("still answers a started booking with the generic rejection when the capability is wrong", async () => {
    const booking = await createBookingAt(futureSlot(0, 17, 30), "+5511980000006");
    const startAt = new Date(Date.now() - 60 * 60_000);
    await admin
      .from("bookings")
      .update({ start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 30 * 60_000).toISOString() })
      .eq("id", booking.id);

    const { error } = await admin.rpc("cancel_booking_by_public_code", {
      p_code: booking.public_code,
      p_cancel_token_hash: "0".repeat(64),
    });
    expect(String(error?.message)).toContain("CANCELLATION_REJECTED");
  });

  it("anon CANNOT execute the cancel RPC directly", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("cancel_booking_by_public_code", {
      p_code: "ZZZZZZZZ",
      p_cancel_token_hash: CANCEL_TOKEN_HASH,
    });
    expect(error).not.toBeNull();
  });
});

describe("join_waitlist (INC-3)", () => {
  it("creates a waitlist entry on an occupied slot and de-duplicates by slot + phone", async () => {
    const args = {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: SLOT_WAIT,
      p_customer_name: "Maria",
      p_customer_phone: "+5511980000010",
      p_cancel_token_hash: waitlistTokenHash(),
    };
    const first = await admin.rpc("join_waitlist", { ...args, p_customer_email: "a@b.com" });
    expect(first.error).toBeNull();
    expect(first.data?.status).toBe("pending");
    expect(first.data?.customer_email).toBe("a@b.com");

    const second = await admin.rpc("join_waitlist", { ...args, p_customer_email: "a@b.com" });
    expect(second.error).toBeNull();
    expect(first.data!.id).toBe(second.data!.id);

    const other = await admin.rpc("join_waitlist", {
      ...args,
      p_customer_phone: "+5511980000011",
      p_cancel_token_hash: waitlistTokenHash(),
    });
    expect(other.data!.id).not.toBe(first.data!.id);
  });

  it("rejects a free (not occupied) slot", async () => {
    const { error } = await admin.rpc("join_waitlist", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: SLOT_2,
      p_customer_name: "Maria",
      p_customer_phone: "+5511980000012",
      p_cancel_token_hash: waitlistTokenHash(),
    });
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/not_occupied|occupied|free/i);
  });

  it("rejects a past slot", async () => {
    const { error } = await admin.rpc("join_waitlist", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: "2020-01-01T00:00:00.000Z",
      p_customer_name: "Maria",
      p_customer_phone: "+5511980000013",
      p_cancel_token_hash: waitlistTokenHash(),
    });
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/past|waitlist/i);
  });

  it("anon CANNOT execute the waitlist RPC directly", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("join_waitlist", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: SLOT_WAIT,
      p_customer_name: "Maria",
      p_customer_phone: "+5511980000014",
      p_cancel_token_hash: waitlistTokenHash(),
    });
    expect(error).not.toBeNull();
  });
});

describe("get_waitlist_for_slot (INC-3 seam)", () => {
  it("returns pending entries for the slot ordered oldest-first", async () => {
    const { data } = await admin.rpc("get_waitlist_for_slot", {
      p_business_id: businessId,
      p_start_at: SLOT_WAIT,
    });
    const entries = (data ?? []).filter((e) => e.customer_phone === "+5511980000010");
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe("pending");
  });
});

describe("waitlist RLS (§13.2)", () => {
  it("the owner can read their own business's waitlist", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { data } = await owner.from("waitlist_entries").select("id, status").eq("business_id", businessId);
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);
  });

  // #219: the digest is the cliente's capability to leave, not the owner's data.
  it("the owner cannot read the cliente's token hash", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    for (const columns of ["cancel_token_hash", "*"]) {
      const { data, error } = await owner.from("waitlist_entries").select(columns).eq("business_id", businessId);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    }
  });

  it("anon cannot read the waitlist", async () => {
    const anon = anonClient();
    const { data, error } = await anon.from("waitlist_entries").select("*").eq("business_id", businessId);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

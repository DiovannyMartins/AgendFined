import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClientForUser, retryOnFk } from "./index";
import { futureSlot } from "./future-slot";

// These are integration tests against the real Supabase project (§19.2).
// RUN: npm run test:integration. Requires .env.local with valid keys.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `teste.${stamp}@agendfined.dev`;
const OTHER_EMAIL = `outro.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let serviceId = "";
let otherUserId = "";

beforeAll(async () => {
  admin = adminClient();

  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = created?.user?.id ?? "";
  await admin.from("profiles").upsert(
    { id: ownerId, display_name: "Teste Integracao" },
    { onConflict: "id" },
  );

  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .upsert(
        {
          owner_id: ownerId,
          name: "Biz Integracao",
          slug: `biz-integracao-${stamp}`,
          phone: "+5511987654321",
          slot_interval_minutes: 30,
          min_notice_minutes: 0,
          booking_window_days: 60,
        },
        { onConflict: "slug" },
      )
      .select("*")
      .single();
    if (bizErr) throw new Error(`business upsert: ${bizErr.message}`);
    return biz.id;
  });

  const { data: svc } = await admin
    .from("services")
    .insert({
      business_id: businessId,
      name: "Corte",
      duration_minutes: 30,
      price_cents: 4000,
    })
    .select("*")
    .single();
  serviceId = svc!.id;

  // A second user for RLS tests.
  const { data: user2 } = await admin.auth.admin.createUser({
    email: OTHER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  otherUserId = user2?.user?.id ?? "";
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(otherUserId).catch(() => undefined);
});

describe("createBooking RPC (§11.4)", () => {
  const slot = futureSlot(0, 14);

  it("preserves an existing customer when a public booking reuses their phone", async () => {
    const original = {
      business_id: businessId,
      name: "Cliente original",
      phone: "+5511912345678",
      email: "original@example.org",
    };
    const { data: customer, error: customerError } = await admin.from("customers")
      .insert(original).select("id").single();
    expect(customerError).toBeNull();

    const { data: booking, error } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: futureSlot(25, 14),
      p_cancel_token_hash: "c".repeat(64),
      p_customer_phone: original.phone,
      p_customer_name: "Nome não verificado",
      p_customer_email: "unverified@example.org",
    });
    expect(error).toBeNull();
    expect(booking).toMatchObject({
      customer_id: customer!.id,
      customer_name_snapshot: "Nome não verificado",
      customer_email_snapshot: "unverified@example.org",
    });

    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { data: visibleCustomer, error: readError } = await owner.from("customers")
      .select("name,phone,email").eq("id", customer!.id).single();
    expect(readError).toBeNull();
    expect(visibleCustomer).toEqual({ name: original.name, phone: original.phone, email: original.email });
  });

  it("creates a valid booking with snapshots", async () => {
    const { data, error } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_cancel_token_hash: "b".repeat(64),
      p_service_id: serviceId,
      p_start_at: slot,
      p_customer_name: "Maria",
      p_customer_phone: "+5511988888888",
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.status).toBe("confirmed");
    expect(data!.service_name_snapshot).toBe("Corte");
    // Updating the service must NOT change existing snapshot.
    await admin.from("services").update({ name: "Corte VIP" }).eq("id", serviceId);
    const { data: fresh } = await admin.rpc("get_booking_by_public_code", { p_code: data!.public_code });
    expect(fresh?.[0]?.service_name).toBe("Corte");
  });

  it("rejects an overlapping booking (exclusion constraint)", async () => {
    const overlapSlot = futureSlot(0, 14, 15);
    const { error } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_cancel_token_hash: "b".repeat(64),
      p_service_id: serviceId,
      p_start_at: overlapSlot,
      p_customer_name: "João",
      p_customer_phone: "+5511977777777",
    });
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/overlap|already|reserved|slash/i);
  });

  it("rejects a booking that starts before min_notice (defense-in-depth, migration 0040)", async () => {
    // A start in the far past must be rejected by the RPC even with min_notice=0.
    const { error } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_cancel_token_hash: "b".repeat(64),
      p_service_id: serviceId,
      p_start_at: "2020-01-01T00:00:00.000Z",
      p_customer_name: "João",
      p_customer_phone: "+5511966666666",
    });
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/min_notice|before|past/i);
  });

  it("public lookup exposes only non-personal data plus the status (§16, #110)", async () => {
    const { data: booking } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_cancel_token_hash: "b".repeat(64),
      p_service_id: serviceId,
      p_start_at: futureSlot(0, 14, 30),
      p_customer_name: "Cliente Sigiloso",
      p_customer_phone: "+5511955555555",
    });
    const code = booking!.public_code;
    // The cookie-based server client isn't available in this process, so exercise
    // the lookup through the identical anon RPC it wraps.
    const { data: row } = await admin.rpc("get_booking_by_public_code", { p_code: code });
    const lo = row?.[0];
    expect(typeof lo?.service_name).toBe("string");
    expect(lo?.business_slug).toContain("biz-integracao");
    // The public code must never authorize customer personal data.
    expect(Object.keys(lo ?? {}).sort()).toEqual(
      [
        "business_name",
        "business_phone",
        "business_slug",
        "business_timezone",
        "end_at",
        "service_name",
        "start_at",
        "status",
      ].sort(),
    );
    expect(lo?.status).toBe("confirmed");
  });

  it("the consultation rate limit is keyed per IP and separate from bookings (§16)", async () => {
    const ip = `1.2.3.${stamp}`;
    const key = `ip:${ip}|consult`;
    const limit = 3;
    const windowSeconds = 3600;
    const results: boolean[] = [];
    for (let i = 0; i < limit + 2; i++) {
      const { data } = await admin.rpc("check_booking_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      results.push(data === true);
    }
    // First `limit` calls allowed, then blocked.
    expect(results.slice(0, limit)).toEqual([true, true, true]);
    expect(results[limit]).toBe(false);
  });
});

describe("RLS (§13.2)", () => {
  it("the business owner can read their own bookings via the anon client", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { data } = await owner.from("bookings").select("id, status").eq("business_id", businessId);
    // The owner owns the business, so their confirmed booking (created above) is visible.
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);
  });

  it("the owner cannot read the reminder claim token or the cliente's token hash", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    for (const column of ["reminder_claim_token", "cancel_token_hash"]) {
      const { data, error } = await owner.from("bookings").select(column).eq("business_id", businessId);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    }
  });

  it("an outsider reads the minimal public business RPC but cannot read its bookings", async () => {
    const outsider = await anonClientForUser(OTHER_EMAIL, PASSWORD);
    const { data: businesses, error: businessError } = await outsider.rpc("get_public_business", {
      p_slug: `biz-integracao-${stamp}`,
    });
    expect(businessError).toBeNull();
    const biz = businesses?.[0];
    expect(biz?.id).toBe(businessId);
    expect(Object.keys(biz ?? {}).sort()).toEqual([
      "description",
      "id",
      "name",
      "search_indexing_enabled",
      "slug",
      "timezone",
    ]);
    // But the outsider cannot read the owner's bookings (private data).
    const { data: rows } = await outsider.from("bookings").select("id").eq("business_id", businessId);
    expect(rows?.length ?? 0).toBe(0);
  });
});

describe("block vs future booking conflict (§9.4)", () => {
  it("owner cannot create a block overlapping an active future booking", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    // The 14:00–14:30 slot is the confirmed booking created above; this block
    // covers 13:30–15:00, so it must be rejected by the database layer.
    const { error } = await owner.from("availability_blocks").insert({
      business_id: businessId,
      start_at: futureSlot(0, 13, 30),
      end_at: futureSlot(0, 15),
      reason: "teste sobreposicao",
    });
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/overlap|book|block|conflit/i);
  });

  it("owner cannot create a booking overlapping an existing block", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    // A block on a day with no existing booking; this insert must succeed.
    const { error: blockErr } = await owner.from("availability_blocks").insert({
      business_id: businessId,
      start_at: futureSlot(2, 10),
      end_at: futureSlot(2, 12),
      reason: "bloqueio teste",
    });
    expect(blockErr).toBeNull();
    // create_booking is service_role-only, so call it through the admin client;
    // the bookings trigger must reject a booking that falls inside the block.
    const { error } = await admin.rpc("create_booking", {
      p_business_id: businessId,
      p_cancel_token_hash: "b".repeat(64),
      p_service_id: serviceId,
      p_start_at: futureSlot(2, 10, 30),
      p_customer_name: "Outro Cliente",
      p_customer_phone: "+5511966666666",
    });
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/overlap|book|block|conflit/i);
  });

  // #143: "fechei o resto do dia" over reservas that already happened.
  it("accepts a block starting in the past over reservas that can no longer happen", async () => {
    async function pastBooking(slot: string, phone: string, minutesAgo: number) {
      const { data: booking, error } = await admin.rpc("create_booking", {
        p_business_id: businessId,
        p_cancel_token_hash: "d".repeat(64),
        p_service_id: serviceId,
        p_start_at: slot,
        p_customer_name: "Cliente Passado",
        p_customer_phone: phone,
      });
      expect(error).toBeNull();
      const startAt = new Date(Date.now() - minutesAgo * 60_000);
      const { error: moveError } = await admin
        .from("bookings")
        .update({ start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 30 * 60_000).toISOString() })
        .eq("id", booking!.id);
      expect(moveError).toBeNull();
      return booking!.id as string;
    }
    const completedId = await pastBooking(futureSlot(3, 14), "+5511977770001", 180);
    const endedId = await pastBooking(futureSlot(3, 15), "+5511977770002", 120);
    await admin.from("bookings").update({ status: "completed" }).eq("id", completedId);

    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { error } = await owner.from("availability_blocks").insert({
      business_id: businessId,
      start_at: new Date(Date.now() - 240 * 60_000).toISOString(),
      end_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      reason: "fechei o resto do dia",
    });
    expect(error).toBeNull();

    // The confirmed one already ended; marking it later must still work.
    const { error: markError } = await admin.from("bookings").update({ status: "completed" }).eq("id", endedId);
    expect(markError).toBeNull();
  });
});

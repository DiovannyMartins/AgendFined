import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, anonClientForUser } from "./index";

// Security regression suite (§57). Runs against the real project. Requires
// .env.local with valid keys and the 0013 migration applied.
const stamp = Date.now().toString().slice(-8);
const PASSWORD = "senha12345";

// businesses.owner_id is UNIQUE (one business per owner), so each business gets
// its own owner user to exercise cross-business and cross-user isolation.
let admin: ReturnType<typeof adminClient>;
let ownerAId = "";
let ownerBId = "";
let ownerCId = "";
let outsiderId = "";

// Business A (active) owned by owner A — the private "target" business.
let businessA = "";
let activeServiceA = "";
let inactiveServiceA = "";

// Business B (active) owned by owner B — used for the business/service mismatch.
let businessB = "";
let serviceB = "";

// Business C (INACTIVE) owned by owner C — for the BUSINESS_INACTIVE test.
let businessC = "";
let serviceC = "";

const SLOT_1 = "2099-02-01T10:00:00.000Z";
const SLOT_2 = "2099-02-01T11:00:00.000Z";

function bookingArgs(businessId: string, serviceId: string, startAt = SLOT_1, phone?: string) {
  return {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: "Cliente Teste",
    p_customer_phone: phone ?? `+55119${stamp}`,
    p_customer_email: `cli.${stamp}@agendfined.dev`,
  };
}

// Retry the business insert on the transient `businesses_owner_id_fkey` FK race
// that can appear when the two integration files run in parallel against the
// remote project (the just-upserted owner profile may still be incurring
// primary/connection-pool visibility lag). Production constraints are untouched.
async function retryOnFk<T>(fn: () => Promise<T>, attempts = 6, delayMs = 250): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e as { message?: unknown })?.message ?? e);
      if (!/businesses_owner_id_fkey|23503/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function makeOwnerAdmin(prefix: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${prefix}.${stamp}@agendfined.dev`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data?.user?.id) throw new Error(`owner ${prefix} user: ${error?.message ?? "no id"}`);
  const id = data.user.id;
  const pu = await admin.from("profiles").upsert({ id, display_name: `Donx ${prefix}` }, { onConflict: "id" });
  if (pu.error) throw new Error(`owner ${prefix} profile: ${pu.error.message}`);
  // Confirm the profile is visible before any business references it (see §16).
  const pr = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
  if (pr.error || !pr.data) throw new Error(`owner ${prefix} profile not visible: ${pr.error?.message ?? "null"}`);
  return id;
}

beforeAll(async () => {
  admin = adminClient();

  ownerAId = await makeOwnerAdmin("ownera");
  ownerBId = await makeOwnerAdmin("ownerb");
  ownerCId = await makeOwnerAdmin("ownerc");
  outsiderId = await makeOwnerAdmin("outsider");

  async function makeBusiness(ownerId: string, idSuffix: string, active: boolean) {
    const slug = `biz-${idSuffix}-${stamp}`;
    const { data: biz, error } = await admin
      .from("businesses")
      .upsert(
        {
          owner_id: ownerId,
          name: `Biz ${idSuffix}`,
          slug,
          phone: "+5511977777777",
          slot_interval_minutes: 30,
          min_notice_minutes: 0,
          booking_window_days: 60,
          is_active: active,
        },
        { onConflict: "slug" },
      )
      .select("*")
      .single();
    if (error) throw new Error(`business ${idSuffix}: ${error.message}`);
    return biz!.id;
  }

  async function makeService(businessId: string, idSuffix: string, active: boolean) {
    const { data: svc, error } = await admin
      .from("services")
      .insert({
        business_id: businessId,
        name: `Service ${idSuffix}`,
        duration_minutes: 30,
        price_cents: 4000,
        is_active: active,
      })
      .select("*")
      .single();
    if (error) throw new Error(`service ${idSuffix}: ${error.message}`);
    return svc!.id;
  }

  businessA = await retryOnFk(() => makeBusiness(ownerAId, "a", true));
  activeServiceA = await makeService(businessA, "a-active", true);
  inactiveServiceA = await makeService(businessA, "a-inactive", false);

  businessB = await retryOnFk(() => makeBusiness(ownerBId, "b", true));
  serviceB = await makeService(businessB, "b", true);

  businessC = await retryOnFk(() => makeBusiness(ownerCId, "c", false));
  serviceC = await makeService(businessC, "c", false);
});

afterAll(async () => {
  await admin
    .from("businesses")
    .delete()
    .in("id", [businessA, businessB, businessC]);
  await Promise.all(
    [ownerAId, ownerBId, ownerCId, outsiderId].map((id) =>
      admin.auth.admin.deleteUser(id).catch(() => undefined),
    ),
  );
});

describe("create_booking privileges (§29/§30/§31/§37)", () => {
  it("anon CANNOT execute create_booking directly", async () => {
    const anon = anonClient();
    const { data, error } = await anon.rpc("create_booking", bookingArgs(businessA, activeServiceA, SLOT_1, `+551198${stamp}`));
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("authenticated user CANNOT execute create_booking directly", async () => {
    const owner = await anonClientForUser(`ownera.${stamp}@agendfined.dev`, PASSWORD);
    const { data, error } = await owner.rpc("create_booking", bookingArgs(businessA, activeServiceA, SLOT_1, `+551197${stamp}`));
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("service_role CAN execute create_booking (legitimate server flow)", async () => {
    const { data, error } = await admin.rpc("create_booking", bookingArgs(businessA, activeServiceA, SLOT_1, `+551196${stamp}`));
    expect(error).toBeNull();
    expect(data?.status).toBe("confirmed");
  });
});

describe("create_booking integrity (§8/§9/§32/§33/§34)", () => {
  it("rejects a service that belongs to another business", async () => {
    const { error } = await admin.rpc("create_booking", bookingArgs(businessA, serviceB, SLOT_2, `+551195${stamp}`));
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/mismatch|service_business|permission/i);
  });

  it("rejects an inactive business even though the service is active", async () => {
    const { error } = await admin.rpc("create_booking", bookingArgs(businessC, serviceC, SLOT_2, `+551194${stamp}`));
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/inactive|not_found/i);
  });

  it("rejects an inactive service", async () => {
    const { error } = await admin.rpc("create_booking", bookingArgs(businessA, inactiveServiceA, SLOT_2, `+551193${stamp}`));
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/inactive|not_found/i);
  });

  it("rejects an overlapping booking (exclusion constraint, §42)", async () => {
    // SLOT_1 has a confirmed booking on business A from the privilege test.
    const { error } = await admin.rpc(
      "create_booking",
      bookingArgs(businessA, activeServiceA, SLOT_1, `+551192${stamp}`),
    );
    expect(error).not.toBeNull();
  });
});

describe("RLS isolation User A vs User B (§35)", () => {
  it("outsider cannot read the owner's bookings", async () => {
    const outsider = await anonClientForUser(`outsider.${stamp}@agendfined.dev`, PASSWORD);
    const { data } = await outsider.from("bookings").select("*").eq("business_id", businessA);
    expect(data?.length ?? 0).toBe(0);
  });

  it("outsider cannot read the owner's customers", async () => {
    const outsider = await anonClientForUser(`outsider.${stamp}@agendfined.dev`, PASSWORD);
    const { data } = await outsider.from("customers").select("*").eq("business_id", businessA);
    expect(data?.length ?? 0).toBe(0);
  });

  it("outsider cannot update a booking it cannot see", async () => {
    const outsider = await anonClientForUser(`outsider.${stamp}@agendfined.dev`, PASSWORD);
    const { data, error } = await outsider
      .from("bookings")
      .update({ customer_name_snapshot: "hacked" })
      .eq("business_id", businessA)
      .select("*");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("outsider cannot insert a service into the owner's business", async () => {
    const outsider = await anonClientForUser(`outsider.${stamp}@agendfined.dev`, PASSWORD);
    const { error } = await outsider.from("services").insert({
      business_id: businessA,
      name: "Service Invasor",
      duration_minutes: 30,
      price_cents: 100,
    });
    expect(error).not.toBeNull();
  });

  it("outsider cannot change the owner of business A", async () => {
    const outsider = await anonClientForUser(`outsider.${stamp}@agendfined.dev`, PASSWORD);
    const { data, error } = await outsider
      .from("businesses")
      .update({ owner_id: outsiderId })
      .eq("id", businessA)
      .select("*");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

describe("anon data exposure (§36)", () => {
  it("anon cannot read customers", async () => {
    const anon = anonClient();
    const { data } = await anon.from("customers").select("*").eq("business_id", businessA);
    expect(data?.length ?? 0).toBe(0);
  });

  it("anon cannot read bookings", async () => {
    const anon = anonClient();
    const { data } = await anon.from("bookings").select("*").eq("business_id", businessA);
    expect(data?.length ?? 0).toBe(0);
  });

  it("anon cannot read availability", async () => {
    const anon = anonClient();
    const { data } = await anon.from("availability").select("*").eq("business_id", businessA);
    expect(data?.length ?? 0).toBe(0);
  });

  it("anon cannot read availability_blocks", async () => {
    const anon = anonClient();
    const { data } = await anon.from("availability_blocks").select("*").eq("business_id", businessA);
    expect(data?.length ?? 0).toBe(0);
  });

  it("anon can read an active business but not an inactive one", async () => {
    const anon = anonClient();
    const { data: active } = await anon.from("businesses").select("*").eq("id", businessA);
    expect(active?.length ?? 0).toBeGreaterThan(0);
    const { data: inactive } = await anon.from("businesses").select("*").eq("id", businessC);
    expect(inactive?.length ?? 0).toBe(0);
  });

  it("anon can read active services of an active business but not inactive services", async () => {
    const anon = anonClient();
    const { data: svc } = await anon.from("services").select("*").eq("id", inactiveServiceA);
    expect(svc?.length ?? 0).toBe(0);
  });
});

describe("public lookup goes through the server layer (§16) and returns no PII", () => {
  let publicCode = "";

  it("anon CANNOT call the SECURITY DEFINER lookup directly (hardened)", async () => {
    const { data: created } = await admin.rpc(
      "create_booking",
      bookingArgs(businessA, activeServiceA, "2099-02-11T09:00:00.000Z", `+551191${stamp}`),
    );
    publicCode = created!.public_code;
    const anon = anonClient();
    const { error } = await anon.rpc("get_booking_by_public_code", {
      p_code: publicCode,
    });
    // §0016: the capability endpoint is revoked from anon/authenticated; all
    // public access must flow through the Next.js server (service role).
    expect(error).not.toBeNull();
    expect(String(error?.message ?? "").toLowerCase()).toMatch(/permission denied|function/i);
  });

  it("the service-role resolution returns no PII", async () => {
    const { data: row } = await admin.rpc("get_booking_by_public_code", {
      p_code: publicCode,
    });
    expect(row?.[0]).toBeDefined();
    expect(row?.[0]).not.toHaveProperty("customer_name_snapshot");
    expect(row?.[0]).not.toHaveProperty("customer_phone_snapshot");
    expect(row?.[0]).not.toHaveProperty("customer_email_snapshot");
    expect(row?.[0]).not.toHaveProperty("owner_id");
  });
});

describe("rate limiting (§40)", () => {
  it("blocks after the per-key limit is exceeded", async () => {
    const key = `test:${stamp}:ip:1.2.3.4|business:${businessA}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { data } = await admin.rpc("check_booking_rate_limit", {
        p_key: key,
        p_limit: 3,
        p_window_seconds: 3600,
      });
      results.push(data === true);
    }
    expect(results.slice(0, 3)).toEqual([true, true, true]);
    expect(results[3]).toBe(false);
  });

  it("isolates independent keys (different business)", async () => {
    const keyB = `test:${stamp}:ip:1.2.3.4|business:${businessB}`;
    const { data } = await admin.rpc("check_booking_rate_limit", {
      p_key: keyB,
      p_limit: 3,
      p_window_seconds: 3600,
    });
    expect(data).toBe(true);
  });

  it("resets once the window expires", async () => {
    const key = `test:${stamp}:expiry`;
    const windowSeconds = 3;
    const first = await admin.rpc("check_booking_rate_limit", { p_key: key, p_limit: 1, p_window_seconds: windowSeconds });
    expect(first.data).toBe(true);
    const second = await admin.rpc("check_booking_rate_limit", { p_key: key, p_limit: 1, p_window_seconds: windowSeconds });
    expect(second.data).toBe(false);
    await new Promise((r) => setTimeout(r, windowSeconds * 1000 + 1500));
    const third = await admin.rpc("check_booking_rate_limit", { p_key: key, p_limit: 1, p_window_seconds: windowSeconds });
    expect(third.data).toBe(true);
  }, 15000);
});

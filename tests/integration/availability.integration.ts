import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, retryOnFk } from "./index";

// Availability overlap constraint (migration 0041, §9.3). Runs against the real
// project. Requires .env.local with valid keys and the migration applied.
// The constraint is partial on is_active, so only active faixas are compared.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `avail.${stamp}@agendfined.dev`;
const PASSWORD = "senha12345";

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";

beforeAll(async () => {
  admin = adminClient();

  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = created?.user?.id ?? "";
  await admin.from("profiles").upsert(
    { id: ownerId, display_name: "Avail Test" },
    { onConflict: "id" },
  );

  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .upsert(
        {
          owner_id: ownerId,
          name: "Biz Avail",
          slug: `biz-avail-${stamp}`,
          phone: "+5511981234567",
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
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("availability no-overlap constraint (§9.3, migration 0041)", () => {
  it("accepts non-overlapping faixas on the same business/weekday", async () => {
    const { data: first, error: e1 } = await admin
      .from("availability")
      .insert({ business_id: businessId, weekday: 2, start_time: "08:00", end_time: "10:00" })
      .select("*")
      .single();
    expect(e1).toBeNull();
    expect(first).toBeDefined();

    const { error: e2 } = await admin
      .from("availability")
      .insert({ business_id: businessId, weekday: 2, start_time: "10:00", end_time: "12:00" })
      .select("*")
      .single();
    expect(e2).toBeNull();
  });

  it("rejects an overlapping faixa on the same business/weekday", async () => {
    const { error } = await admin
      .from("availability")
      .insert({ business_id: businessId, weekday: 2, start_time: "09:00", end_time: "11:00" })
      .select("*")
      .single();
    expect(error).not.toBeNull();
    expect(String(error?.message).toLowerCase()).toMatch(/overlap|exclusion|gist|violat/i);
  });

  it("allows overlapping faixas on a different weekday (no cross-day constraint)", async () => {
    const { error } = await admin
      .from("availability")
      .insert({ business_id: businessId, weekday: 3, start_time: "09:00", end_time: "11:00" })
      .select("*")
      .single();
    expect(error).toBeNull();
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { adminClient, anonClient, anonClientForUser, retryOnFk, ACTIVE_TRIAL_ENDS_AT } from "./index";
import { futureSlot } from "./future-slot";

// #193: create_owner_booking lets the dono book a cliente from the dashboard.
// Only the dono calls it, the antecedência and the configured janela do not
// apply, and bloqueios, sobreposição (ADR 0003) and the plan limit (365 days)
// still do.
// RUN: npm run test:integration:local
const stamp = Date.now().toString().slice(-8);
const OWNER_EMAIL = `owner-bk.${stamp}@agendfined.dev`;
const OUTSIDER_EMAIL = `owner-bk-out.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let outsiderId = "";
let businessId = "";
let serviceId = "";

const digest = () => randomBytes(32).toString("hex");

async function createUser(email: string): Promise<string> {
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = data?.user?.id ?? "";
  await admin.from("profiles").upsert({ id, display_name: "Dono" }, { onConflict: "id" });
  return id;
}

async function createBusiness(owner: string, name: string): Promise<string> {
  return retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: owner,
        name,
        slug: `${name}-${stamp}`,
        phone: "11987654321",
        slot_interval_minutes: 30,
        // A public reserva would need a day of notice and fit in a week.
        min_notice_minutes: 1440,
        booking_window_days: 7,
        trial_ends_at: ACTIVE_TRIAL_ENDS_AT,
      })
      .select("id")
      .single();
    if (error) throw new Error(`business insert: ${error.message}`);
    return data.id;
  });
}

function bookingArgs(startAt: string, overrides: Record<string, string> = {}) {
  return {
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: "Bruna Lima",
    p_customer_phone: "11988887777",
    p_cancel_token_hash: digest(),
    ...overrides,
  };
}

beforeAll(async () => {
  admin = adminClient();
  ownerId = await createUser(OWNER_EMAIL);
  businessId = await createBusiness(ownerId, "owner-bk");
  const { data: service } = await admin
    .from("services")
    .insert({ business_id: businessId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single();
  serviceId = service!.id;

  outsiderId = await createUser(OUTSIDER_EMAIL);
  await createBusiness(outsiderId, "owner-bk-out");
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.from("businesses").delete().eq("owner_id", outsiderId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(outsiderId).catch(() => undefined);
});

describe("create_owner_booking (#193)", () => {
  it("cria a reserva do dono sem e-mail, sem antecedência e com snapshot", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    const soon = new Date(Date.now() + 60 * 60_000);
    soon.setUTCSeconds(0, 0);

    const { data, error } = await owner.rpc("create_owner_booking", bookingArgs(soon.toISOString()));

    expect(error).toBeNull();
    expect(data).toMatchObject({
      business_id: businessId,
      status: "confirmed",
      customer_email_snapshot: null,
      service_name_snapshot: "Corte",
      duration_minutes_snapshot: 30,
      price_cents_snapshot: 4000,
    });
    expect(data!.public_code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("aceita uma data além da janela configurada, dentro do limite do plano", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);

    const { error } = await owner.rpc("create_owner_booking", bookingArgs(futureSlot(30, 15)));

    expect(error).toBeNull();
  });

  it("recusa além dos 365 dias do plano e no passado", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);

    const beyond = await owner.rpc("create_owner_booking", bookingArgs(futureSlot(400, 15)));
    expect(beyond.error?.message).toContain("BOOKING_OUTSIDE_PLAN_WINDOW");

    const past = await owner.rpc("create_owner_booking", bookingArgs(new Date(Date.now() - 60_000).toISOString()));
    expect(past.error?.message).toContain("BOOKING_IN_PAST");
  });

  it("respeita a sobreposição e os bloqueios", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    const slot = futureSlot(1, 16);

    expect((await owner.rpc("create_owner_booking", bookingArgs(slot))).error).toBeNull();
    const overlap = await owner.rpc("create_owner_booking", bookingArgs(slot, { p_customer_phone: "11977776666" }));
    expect(overlap.error?.code).toBe("23P01");

    await admin
      .from("availability_blocks")
      .insert({ business_id: businessId, start_at: futureSlot(2, 13), end_at: futureSlot(2, 15) });
    const blocked = await owner.rpc("create_owner_booking", bookingArgs(futureSlot(2, 14)));
    expect(blocked.error?.message).toContain("BOOKING_BLOCK_OVERLAP");
  });

  it("preserva o cliente já cadastrado pelo telefone", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);

    const { data, error } = await owner.rpc(
      "create_owner_booking",
      bookingArgs(futureSlot(3, 15), { p_customer_name: "Outro Nome", p_customer_email: "bruna@example.com" }),
    );

    expect(error).toBeNull();
    expect(data!.customer_name_snapshot).toBe("Outro Nome");
    const { data: customer } = await admin.from("customers").select("name").eq("id", data!.customer_id).single();
    expect(customer!.name).toBe("Bruna Lima");
  });

  it("só grava no negócio de quem chama e nega o anônimo", async () => {
    const outsider = await anonClientForUser(OUTSIDER_EMAIL, PASSWORD);
    // The outsider's business has no such serviço: the id belongs to another negócio.
    const foreign = await outsider.rpc("create_owner_booking", bookingArgs(futureSlot(4, 15)));
    expect(foreign.error?.message).toContain("SERVICE_NOT_FOUND");

    const anonymous = await anonClient().rpc("create_owner_booking", bookingArgs(futureSlot(4, 15)));
    expect(anonymous.error).not.toBeNull();
  });
});

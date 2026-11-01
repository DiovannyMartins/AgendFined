import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { adminClient, anonClient, anonClientForUser, retryOnFk, ACTIVE_TRIAL_ENDS_AT } from "./index";
import { futureSlot } from "./future-slot";

// #194 / ADR 0010: remarcar moves the same reserva. reschedule_owner_booking is
// the dono's (rules of create_owner_booking), reschedule_booking_by_public_code
// the cliente's with the cancellation token (rules of create_booking). Both keep
// code, token, snapshot and history, and bloqueios and sobreposição still apply.
// RUN: npm run test:integration:local
const stamp = Date.now().toString().slice(-8);
const OWNER_EMAIL = `resched.${stamp}@agendfined.dev`;
const OUTSIDER_EMAIL = `resched-out.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let outsiderId = "";
let businessId = "";
let serviceId = "";
let phoneSeq = 0;

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
        trial_ends_at: ACTIVE_TRIAL_ENDS_AT,
        name,
        slug: `${name}-${stamp}`,
        phone: "11987654321",
        slot_interval_minutes: 30,
        min_notice_minutes: 120,
        booking_window_days: 20,
      })
      .select("id")
      .single();
    if (error) throw new Error(`business insert: ${error.message}`);
    return data.id;
  });
}

// A public reserva, with the digest the cliente's link carries.
async function publicBooking(startAt: string) {
  const tokenHash = digest();
  phoneSeq += 1;
  const { data, error } = await admin.rpc("create_booking", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: "Bruna Lima",
    p_customer_phone: `1198888${String(phoneSeq).padStart(4, "0")}`,
    p_customer_email: "bruna@example.com",
    p_cancel_token_hash: tokenHash,
  });
  if (error || !data) throw new Error(`create_booking: ${error?.message}`);
  return { booking: data, tokenHash };
}

beforeAll(async () => {
  admin = adminClient();
  ownerId = await createUser(OWNER_EMAIL);
  businessId = await createBusiness(ownerId, "resched");
  const { data: service } = await admin
    .from("services")
    .insert({ business_id: businessId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single();
  serviceId = service!.id;

  outsiderId = await createUser(OUTSIDER_EMAIL);
  await createBusiness(outsiderId, "resched-out");
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.from("businesses").delete().eq("owner_id", outsiderId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(outsiderId).catch(() => undefined);
});

describe("reschedule_owner_booking (#194)", () => {
  it("move a mesma reserva, mantém código, token e snapshot e registra o histórico", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    const { booking, tokenHash } = await publicBooking(futureSlot(1, 13));
    await admin
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", booking.id);
    // The service changes after the reserva: the snapshot must not follow it.
    await admin.from("services").update({ duration_minutes: 60 }).eq("id", serviceId);

    const { data, error } = await owner.rpc("reschedule_owner_booking", {
      p_booking_id: booking.id,
      p_start_at: futureSlot(1, 15),
    });
    await admin.from("services").update({ duration_minutes: 30 }).eq("id", serviceId);

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: booking.id,
      public_code: booking.public_code,
      status: "confirmed",
      duration_minutes_snapshot: 30,
      reminder_sent_at: null,
    });
    expect(Date.parse(data!.start_at)).toBe(Date.parse(futureSlot(1, 15)));
    expect(Date.parse(data!.end_at)).toBe(Date.parse(futureSlot(1, 15, 30)));
    expect(data!.rescheduled_at).not.toBeNull();
    // The RPC no longer returns the digest (#219); the row still keeps it.
    const { data: stored } = await admin
      .from("bookings")
      .select("cancel_token_hash")
      .eq("id", booking.id)
      .single();
    expect(stored!.cancel_token_hash).toBe(tokenHash);

    const { data: history } = await owner
      .from("booking_reschedules")
      .select("previous_start_at, start_at, rescheduled_by")
      .eq("booking_id", booking.id);
    expect(history).toHaveLength(1);
    expect(history![0].rescheduled_by).toBe("business");
    expect(Date.parse(history![0].previous_start_at)).toBe(Date.parse(futureSlot(1, 13)));
  });

  it("move dentro do próprio intervalo sem conflitar consigo mesma", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    const { booking } = await publicBooking(futureSlot(2, 13));

    const { error } = await owner.rpc("reschedule_owner_booking", {
      p_booking_id: booking.id,
      p_start_at: futureSlot(2, 13, 15),
    });

    expect(error).toBeNull();
  });

  it("respeita a sobreposição, os bloqueios, o passado, o limite do plano e o mesmo horário", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    const { booking } = await publicBooking(futureSlot(3, 13));
    await publicBooking(futureSlot(3, 15));
    await admin
      .from("availability_blocks")
      .insert({ business_id: businessId, start_at: futureSlot(3, 17), end_at: futureSlot(3, 18) });
    const move = (startAt: string) =>
      owner.rpc("reschedule_owner_booking", { p_booking_id: booking.id, p_start_at: startAt });

    expect((await move(futureSlot(3, 15))).error?.code).toBe("23P01");
    expect((await move(futureSlot(3, 17))).error?.message).toContain("BOOKING_BLOCK_OVERLAP");
    expect((await move(new Date(Date.now() - 60_000).toISOString())).error?.message).toContain("BOOKING_IN_PAST");
    expect((await move(futureSlot(400, 15))).error?.message).toContain("BOOKING_OUTSIDE_PLAN_WINDOW");
    expect((await move(futureSlot(3, 13))).error?.message).toContain("BOOKING_SAME_START");
    // Beyond the configured janela, inside the plan limit: the dono may.
    expect((await move(futureSlot(30, 15))).error).toBeNull();
  });

  it("recusa reserva cancelada ou que já começou", async () => {
    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    const { booking } = await publicBooking(futureSlot(4, 13));
    await admin.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);

    const cancelled = await owner.rpc("reschedule_owner_booking", {
      p_booking_id: booking.id,
      p_start_at: futureSlot(4, 15),
    });
    expect(cancelled.error?.message).toContain("BOOKING_NOT_CONFIRMED");

    const { booking: started } = await publicBooking(futureSlot(5, 13));
    await admin
      .from("bookings")
      .update({ start_at: new Date(Date.now() - 10 * 60_000).toISOString(), end_at: new Date(Date.now() + 20 * 60_000).toISOString() })
      .eq("id", started.id);
    const running = await owner.rpc("reschedule_owner_booking", {
      p_booking_id: started.id,
      p_start_at: futureSlot(5, 15),
    });
    expect(running.error?.message).toContain("BOOKING_ALREADY_STARTED");
  });

  it("só move reservas do próprio negócio e não deixa gravar o histórico direto", async () => {
    const { booking } = await publicBooking(futureSlot(6, 13));
    const outsider = await anonClientForUser(OUTSIDER_EMAIL, PASSWORD);

    const foreign = await outsider.rpc("reschedule_owner_booking", {
      p_booking_id: booking.id,
      p_start_at: futureSlot(6, 15),
    });
    expect(foreign.error?.message).toContain("BOOKING_NOT_FOUND");

    const anonymous = await anonClient().rpc("reschedule_owner_booking", {
      p_booking_id: booking.id,
      p_start_at: futureSlot(6, 15),
    });
    expect(anonymous.error).not.toBeNull();

    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    const forged = await owner.from("booking_reschedules").insert({
      booking_id: booking.id,
      business_id: businessId,
      previous_start_at: futureSlot(6, 13),
      previous_end_at: futureSlot(6, 13, 30),
      start_at: futureSlot(6, 15),
      end_at: futureSlot(6, 15, 30),
      rescheduled_by: "customer",
    });
    expect(forged.error).not.toBeNull();

    const direct = await owner.from("bookings").update({ start_at: futureSlot(6, 16) }).eq("id", booking.id);
    expect(direct.error).not.toBeNull();
  });
});

describe("reschedule_booking_by_public_code (#194)", () => {
  it("o detentor do token move a própria reserva", async () => {
    const { booking, tokenHash } = await publicBooking(futureSlot(7, 13));

    const { data, error } = await admin.rpc("reschedule_booking_by_public_code", {
      p_code: booking.public_code,
      p_cancel_token_hash: tokenHash,
      p_start_at: futureSlot(8, 14),
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ id: booking.id, public_code: booking.public_code, status: "confirmed" });
    const { data: history } = await admin
      .from("booking_reschedules")
      .select("rescheduled_by")
      .eq("booking_id", booking.id)
      .single();
    expect(history!.rescheduled_by).toBe("customer");
  });

  it("recusa token errado com a resposta genérica", async () => {
    const { booking } = await publicBooking(futureSlot(9, 13));

    const { error } = await admin.rpc("reschedule_booking_by_public_code", {
      p_code: booking.public_code,
      p_cancel_token_hash: digest(),
      p_start_at: futureSlot(9, 15),
    });

    expect(error?.message).toContain("RESCHEDULE_REJECTED");
  });

  it("aplica a antecedência, a janela configurada e o serviço ativo", async () => {
    const { booking, tokenHash } = await publicBooking(futureSlot(10, 13));
    const move = (startAt: string) =>
      admin.rpc("reschedule_booking_by_public_code", {
        p_code: booking.public_code,
        p_cancel_token_hash: tokenHash,
        p_start_at: startAt,
      });

    const soon = new Date(Date.now() + 30 * 60_000).toISOString();
    expect((await move(soon)).error?.message).toContain("BOOKING_BEFORE_MIN_NOTICE");
    // Configured janela of 20 days, below the plan limit.
    expect((await move(futureSlot(30, 15))).error?.message).toContain("BOOKING_OUTSIDE_PLAN_WINDOW");

    await admin.from("services").update({ is_active: false }).eq("id", serviceId);
    const inactive = await move(futureSlot(10, 15));
    await admin.from("services").update({ is_active: true }).eq("id", serviceId);
    expect(inactive.error?.message).toContain("SERVICE_INACTIVE");
  });

  it("não é chamável pelo dono nem pelo anônimo", async () => {
    const { booking, tokenHash } = await publicBooking(futureSlot(11, 13));
    const args = { p_code: booking.public_code, p_cancel_token_hash: tokenHash, p_start_at: futureSlot(11, 15) };

    const owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
    expect((await owner.rpc("reschedule_booking_by_public_code", args)).error).not.toBeNull();
    expect((await anonClient().rpc("reschedule_booking_by_public_code", args)).error).not.toBeNull();
  });
});

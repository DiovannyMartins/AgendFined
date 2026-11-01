import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomInt } from "node:crypto";
import {
  adminClient,
  anonClient,
  anonClientForUser,
  retryOnFk,
  ACTIVE_TRIAL_ENDS_AT,
  SUSPENDED_TRIAL_ENDS_AT,
} from "./index";
import { futureSlot } from "./future-slot";

// Operações do dono num negócio suspenso (#261, fase 3, ADR 0013). O banco
// recusa o que é operar (RPCs com BUSINESS_SUSPENDED, policies de escrita) e
// deixa o que é ler, cancelar e cuidar da conta. A janela é sempre de 365 dias.
const stamp = `${Date.now().toString().slice(-8)}${randomInt(100, 999)}`;
const OWNER_EMAIL = `gate-owner.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const tokenHash = () => randomBytes(32).toString("hex");

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let businessId = "";
let serviceId = "";
let availabilityId = "";
let blockId = "";
let bookingToCancelId = "";
let bookingToConcludeId = "";
let waitlistEntryId = "";
let owner: Awaited<ReturnType<typeof anonClientForUser>>;

async function setTrialEnd(trialEndsAt: string) {
  const { error } = await admin.from("businesses").update({ trial_ends_at: trialEndsAt }).eq("id", businessId);
  expect(error).toBeNull();
}

async function book(startAt: string, phone: string) {
  const { data, error } = await admin.rpc("create_booking", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: "Cliente",
    p_customer_phone: phone,
    p_cancel_token_hash: tokenHash(),
  });
  if (error) throw new Error(`create_booking: ${error.message}`);
  return data!;
}

beforeAll(async () => {
  admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: OWNER_EMAIL, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser");
  ownerId = data.user.id;
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dono Suspenso" }, { onConflict: "id" });

  businessId = await retryOnFk(async () => {
    const { data: biz, error: bizError } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: "Agenda Suspensa",
        slug: `agenda-suspensa-${stamp}`,
        phone: "11987654321",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 30,
        trial_ends_at: ACTIVE_TRIAL_ENDS_AT,
      })
      .select("id")
      .single();
    if (bizError) throw new Error(`business insert: ${bizError.message}`);
    return biz.id;
  });

  const { data: svc } = await admin
    .from("services")
    .insert({ business_id: businessId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single();
  serviceId = svc!.id;
  const { data: faixa } = await admin
    .from("availability")
    .insert({ business_id: businessId, weekday: 2, start_time: "09:00", end_time: "18:00" })
    .select("id")
    .single();
  availabilityId = faixa!.id;
  const { data: block } = await admin
    .from("availability_blocks")
    .insert({ business_id: businessId, start_at: futureSlot(20, 10), end_at: futureSlot(20, 11) })
    .select("id")
    .single();
  blockId = block!.id;

  // Everything that needs access is set up while the teste runs.
  bookingToCancelId = (await book(futureSlot(2, 13), "11981110001")).id;
  const occupied = await book(futureSlot(3, 13), "11981110002");
  // A reserva that already started, the only kind the dono may conclude.
  const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const { data: started, error: startedError } = await admin
    .from("bookings")
    .insert({
      business_id: businessId,
      service_id: serviceId,
      customer_id: occupied.customer_id,
      customer_name_snapshot: "Cliente",
      customer_phone_snapshot: "11981110002",
      service_name_snapshot: "Corte",
      duration_minutes_snapshot: 30,
      price_cents_snapshot: 4000,
      start_at: startedAt.toISOString(),
      end_at: new Date(startedAt.getTime() + 30 * 60 * 1000).toISOString(),
      cancel_token_hash: tokenHash(),
    })
    .select("id")
    .single();
  if (startedError) throw new Error(`started booking: ${startedError.message}`);
  bookingToConcludeId = started.id;
  const { data: entry, error: entryError } = await admin.rpc("join_waitlist", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: futureSlot(3, 13),
    p_customer_name: "Espera",
    p_customer_phone: "11981110003",
    p_cancel_token_hash: tokenHash(),
  });
  if (entryError) throw new Error(`join_waitlist: ${entryError.message}`);
  waitlistEntryId = entry!.id;

  owner = await anonClientForUser(OWNER_EMAIL, PASSWORD);
  await setTrialEnd(SUSPENDED_TRIAL_ENDS_AT);
});

afterAll(async () => {
  await admin.from("businesses").delete().eq("owner_id", ownerId);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
});

describe("negócio suspenso: o que fica fechado", () => {
  it("não tem acesso", async () => {
    const { data } = await admin.rpc("business_has_access", { p_business_id: businessId });
    expect(data).toBe(false);
  });

  it("recusa criar, editar e excluir serviços", async () => {
    const insert = await owner.from("services").insert({ business_id: businessId, name: "Barba", duration_minutes: 30, price_cents: 3000 });
    expect(insert.error?.code).toBe("42501");

    const update = await owner.from("services").update({ name: "Corte novo" }).eq("id", serviceId).select("id");
    expect(update.error?.code).toBe("42501");

    const removed = await admin.rpc("delete_service_if_unused", { p_business_id: businessId, p_service_id: serviceId });
    expect(removed.data).toBe("BUSINESS_SUSPENDED");
    const { data: still } = await admin.from("services").select("name").eq("id", serviceId).single();
    expect(still?.name).toBe("Corte");
  });

  it("recusa mexer na disponibilidade e nos bloqueios", async () => {
    const faixa = await owner.from("availability").insert({ business_id: businessId, weekday: 3, start_time: "09:00", end_time: "12:00" });
    expect(faixa.error?.code).toBe("42501");
    const editFaixa = await owner.from("availability").update({ end_time: "17:00" }).eq("id", availabilityId).select("id");
    expect(editFaixa.error?.code).toBe("42501");
    await owner.from("availability").delete().eq("id", availabilityId);

    const block = await owner.from("availability_blocks").insert({ business_id: businessId, start_at: futureSlot(21, 10), end_at: futureSlot(21, 11) });
    expect(block.error?.code).toBe("42501");
    await owner.from("availability_blocks").delete().eq("id", blockId);

    const [{ count: faixas }, { count: blocks }] = await Promise.all([
      admin.from("availability").select("id", { count: "exact", head: true }).eq("id", availabilityId),
      admin.from("availability_blocks").select("id", { count: "exact", head: true }).eq("id", blockId),
    ]);
    expect(faixas).toBe(1);
    expect(blocks).toBe(1);
  });

  it("recusa mudar as configurações do negócio", async () => {
    const { error } = await owner.from("businesses").update({ name: "Outro nome" }).eq("id", businessId).select("id");
    expect(error?.code).toBe("42501");
  });

  it("recusa criar e remarcar reservas pelo dono", async () => {
    const created = await owner.rpc("create_owner_booking", {
      p_service_id: serviceId,
      p_start_at: futureSlot(5, 13),
      p_customer_name: "Balcão",
      p_customer_phone: "11981110009",
      p_cancel_token_hash: tokenHash(),
    });
    expect(created.error?.message).toContain("BUSINESS_SUSPENDED");

    const moved = await owner.rpc("reschedule_owner_booking", {
      p_booking_id: bookingToCancelId,
      p_start_at: futureSlot(5, 15),
    });
    expect(moved.error?.message).toContain("BUSINESS_SUSPENDED");
  });

  it("recusa concluir uma reserva", async () => {
    const { error } = await owner
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", bookingToConcludeId)
      .select("id");
    expect(error?.code).toBe("42501");
  });

  it("recusa avisar e converter a lista de espera, e não a entrega às automações", async () => {
    const notify = await owner.rpc("notify_waitlist_entry", { p_entry_id: waitlistEntryId });
    expect(notify.error?.message).toContain("BUSINESS_SUSPENDED");
    const convert = await owner.rpc("convert_waitlist_entry", { p_entry_id: waitlistEntryId, p_cancel_token_hash: tokenHash() });
    expect(convert.error?.message).toContain("BUSINESS_SUSPENDED");

    const { data: forSlot } = await admin.rpc("get_waitlist_for_slot", { p_business_id: businessId, p_start_at: futureSlot(3, 13) });
    expect(forSlot ?? []).toHaveLength(0);
  });

  it("mostra a página pública sem aceitar reservas, com o telefone para contato", async () => {
    const { data } = await anonClient().rpc("get_public_booking_page", { p_slug: `agenda-suspensa-${stamp}` });
    expect(data?.[0]?.accepts_bookings).toBe(false);
    expect(data?.[0]?.phone).toBe("11987654321");
  });
});

describe("negócio suspenso: o que fica aberto", () => {
  it("lê reservas, clientes e o próprio negócio", async () => {
    const [bookings, customers, business] = await Promise.all([
      owner.from("bookings").select("id").eq("business_id", businessId),
      owner.from("customers").select("id").eq("business_id", businessId),
      owner.from("businesses").select("id").eq("id", businessId).single(),
    ]);
    expect(bookings.data?.length).toBeGreaterThanOrEqual(2);
    expect(customers.data?.length).toBeGreaterThanOrEqual(2);
    expect(business.data?.id).toBe(businessId);
  });

  it("cancela uma reserva futura", async () => {
    const { data, error } = await owner
      .from("bookings")
      .update({ status: "cancelled", cancel_reason: "Negócio fechado" })
      .eq("id", bookingToCancelId)
      .select("status");
    expect(error).toBeNull();
    expect(data?.[0]?.status).toBe("cancelled");
  });

  it("atualiza o próprio perfil (conta)", async () => {
    const { error } = await owner.from("profiles").update({ display_name: "Dono Ainda" }).eq("id", ownerId);
    expect(error).toBeNull();
  });
});

describe("negócio com acesso: janela de 365 dias", () => {
  beforeAll(async () => {
    await setTrialEnd(ACTIVE_TRIAL_ENDS_AT);
  });

  it("o dono reserva até 365 dias à frente, e não além", async () => {
    const args = (startAt: string) => ({
      p_service_id: serviceId,
      p_start_at: startAt,
      p_customer_name: "Balcão",
      p_customer_phone: "11981110010",
      p_cancel_token_hash: tokenHash(),
    });
    const inside = await owner.rpc("create_owner_booking", args(futureSlot(300, 13)));
    expect(inside.error).toBeNull();
    const beyond = await owner.rpc("create_owner_booking", args(futureSlot(400, 13)));
    expect(beyond.error?.message).toContain("BOOKING_OUTSIDE_PLAN_WINDOW");
  });

  it("a página pública aceita reservas e não mostra o telefone", async () => {
    const { data } = await anonClient().rpc("get_public_booking_page", { p_slug: `agenda-suspensa-${stamp}` });
    expect(data?.[0]?.accepts_bookings).toBe(true);
    expect(data?.[0]?.phone).toBeNull();
  });
});

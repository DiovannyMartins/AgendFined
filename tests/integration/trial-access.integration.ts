import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomInt } from "node:crypto";
import { adminClient, anonClient, anonClientForUser, retryOnFk } from "./index";
import { futureSlot } from "./future-slot";

// Teste grátis e acesso calculado no banco (#261, ADR 0013): trial_ends_at no
// cadastro, registro de testes concedidos que sobrevive à exclusão da conta,
// concessão manual pelo suporte, business_has_access() e a recusa das RPCs
// públicas para negócio suspenso, sem tirar do cliente o cancelamento por token.
const stamp = `${Date.now().toString().slice(-8)}${randomInt(100, 999)}`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const DAY_MS = 24 * 60 * 60 * 1000;

let admin: ReturnType<typeof adminClient>;
const ownerIds: string[] = [];

// The registry outlives every run, so each test needs a telefone nobody used.
const randomCelular = () => `11${9}${randomInt(10_000_000, 99_999_999)}`;
const tokenHash = () => randomBytes(32).toString("hex");

async function createOwner(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser");
  ownerIds.push(data.user.id);
  await admin.from("profiles").upsert({ id: data.user.id, display_name: "Dono Teste" }, { onConflict: "id" });
  return data.user.id;
}

async function createBusiness(ownerId: string, phone: string, label: string) {
  return retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: `Teste ${label}`,
        slug: `teste-${label}-${stamp}`,
        phone,
        min_notice_minutes: 0,
        booking_window_days: 60,
      })
      .select("id, created_at, trial_ends_at")
      .single();
    if (error) throw new Error(`business insert: ${error.message}`);
    return data;
  });
}

async function createService(businessId: string) {
  const { data, error } = await admin
    .from("services")
    .insert({ business_id: businessId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function hasAccess(businessId: string) {
  const { data, error } = await admin.rpc("business_has_access", { p_business_id: businessId });
  expect(error).toBeNull();
  return data;
}

async function setTrialEnd(businessId: string, trialEndsAt: string | null) {
  const { error } = await admin.from("businesses").update({ trial_ends_at: trialEndsAt }).eq("id", businessId);
  expect(error).toBeNull();
}

function book(businessId: string, serviceId: string, startAt: string, cancelTokenHash = tokenHash()) {
  return admin.rpc("create_booking", {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_customer_name: "Cliente",
    p_customer_phone: randomCelular(),
    p_cancel_token_hash: cancelTokenHash,
  });
}

beforeAll(() => {
  admin = adminClient();
});

afterAll(async () => {
  for (const id of ownerIds) {
    await admin.from("businesses").delete().eq("owner_id", id);
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe("teste grátis no cadastro", () => {
  let businessId = "";
  let serviceId = "";

  beforeAll(async () => {
    const owner = await createOwner(`trial.novo.${stamp}@agendfined.dev`);
    const business = await createBusiness(owner, randomCelular(), "novo");
    businessId = business.id;
    serviceId = await createService(businessId);
    expect(business.trial_ends_at).not.toBeNull();
    expect(new Date(business.trial_ends_at!).getTime() - new Date(business.created_at).getTime()).toBe(30 * DAY_MS);
  });

  it("negócio em teste tem acesso e aceita reserva pública", async () => {
    expect(await hasAccess(businessId)).toBe(true);
    const { data, error } = await book(businessId, serviceId, futureSlot(1, 10));
    expect(error).toBeNull();
    expect(data?.status).toBe("confirmed");
  });

  it("teste vencido suspende na hora, sem cron", async () => {
    await setTrialEnd(businessId, new Date(Date.now() - 1000).toISOString());
    expect(await hasAccess(businessId)).toBe(false);
    await setTrialEnd(businessId, new Date(Date.now() + DAY_MS).toISOString());
    expect(await hasAccess(businessId)).toBe(true);
  });

  it("negócio inexistente não tem acesso (fail-closed)", async () => {
    expect(await hasAccess("00000000-0000-4000-8000-000000000000")).toBe(false);
  });

  it("o dono não muda o próprio teste", async () => {
    const email = `trial.dono.${stamp}@agendfined.dev`;
    const owner = await createOwner(email);
    const business = await createBusiness(owner, randomCelular(), "dono");
    const ownerClient = await anonClientForUser(email, PASSWORD);
    const { error } = await ownerClient
      .from("businesses")
      .update({ trial_ends_at: new Date(Date.now() + 365 * DAY_MS).toISOString() })
      .eq("id", business.id);
    expect(String(error?.message)).toContain("TRIAL_CHANGE_SELF_SERVE_DISABLED");
  });

  it("o registro de testes e a concessão manual ficam fora do alcance do cliente", async () => {
    const anon = anonClient();
    const registry = await anon.from("trial_grants").select("id").limit(1);
    expect(registry.data ?? []).toEqual([]);
    const grant = await anon.rpc("grant_business_trial", { p_business_id: businessId });
    expect(grant.error).not.toBeNull();
    const access = await anon.rpc("business_has_access", { p_business_id: businessId });
    expect(access.error).not.toBeNull();
  });
});

describe("assinatura em dia", () => {
  let businessId = "";

  beforeAll(async () => {
    const owner = await createOwner(`trial.assinante.${stamp}@agendfined.dev`);
    businessId = (await createBusiness(owner, randomCelular(), "assinante")).id;
    await setTrialEnd(businessId, new Date(Date.now() - DAY_MS).toISOString());
  });

  async function subscribe(status: "authorized" | "cancelled", gracePeriodEnd: string | null = null) {
    const { data, error } = await admin
      .from("subscriptions")
      .insert({
        business_id: businessId,
        mp_preapproval_id: `trial-${status}-${stamp}-${randomInt(1000, 9999)}`,
        status,
        grace_period_end: gracePeriodEnd,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const pointer = await admin.from("businesses").update({ current_subscription_id: data!.id }).eq("id", businessId);
    expect(pointer.error).toBeNull();
    return data!.id;
  }

  it("dá acesso depois do teste, inclusive em carência, e o perde quando a carência passa", async () => {
    expect(await hasAccess(businessId)).toBe(false);

    const subscriptionId = await subscribe("authorized");
    expect(await hasAccess(businessId)).toBe(true);

    await admin
      .from("subscriptions")
      .update({ status: "cancelled", grace_period_end: new Date(Date.now() + DAY_MS).toISOString() })
      .eq("id", subscriptionId);
    expect(await hasAccess(businessId)).toBe(true);

    await admin
      .from("subscriptions")
      .update({ grace_period_end: new Date(Date.now() - 1000).toISOString() })
      .eq("id", subscriptionId);
    expect(await hasAccess(businessId)).toBe(false);
  });
});

describe("negócio suspenso", () => {
  let businessId = "";
  let serviceId = "";
  const bookingToken = tokenHash();
  const waitlistToken = tokenHash();
  const occupied = futureSlot(1, 14);
  let publicCode = "";

  beforeAll(async () => {
    const owner = await createOwner(`trial.suspenso.${stamp}@agendfined.dev`);
    businessId = (await createBusiness(owner, randomCelular(), "suspenso")).id;
    serviceId = await createService(businessId);

    // Reserva e entrada na lista de espera feitas enquanto o teste valia.
    const booked = await book(businessId, serviceId, occupied, bookingToken);
    expect(booked.error).toBeNull();
    publicCode = booked.data!.public_code;
    const waiting = await admin.rpc("join_waitlist", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: occupied,
      p_customer_name: "Espera",
      p_customer_phone: randomCelular(),
      p_cancel_token_hash: waitlistToken,
    });
    expect(waiting.error).toBeNull();

    await setTrialEnd(businessId, new Date(Date.now() - 1000).toISOString());
  });

  it("recusa reserva, lista de espera e remarcação pelas RPCs públicas", async () => {
    const booking = await book(businessId, serviceId, futureSlot(1, 16));
    expect(String(booking.error?.message)).toContain("BUSINESS_SUSPENDED");

    const waitlist = await admin.rpc("join_waitlist", {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: occupied,
      p_customer_name: "Outra",
      p_customer_phone: randomCelular(),
      p_cancel_token_hash: tokenHash(),
    });
    expect(String(waitlist.error?.message)).toContain("BUSINESS_SUSPENDED");

    const reschedule = await admin.rpc("reschedule_booking_by_public_code", {
      p_code: publicCode,
      p_cancel_token_hash: bookingToken,
      p_start_at: futureSlot(1, 17),
    });
    expect(String(reschedule.error?.message)).toContain("BUSINESS_SUSPENDED");
  });

  it("o cliente ainda cancela a reserva e sai da lista de espera pelo token", async () => {
    const leave = await admin.rpc("cancel_waitlist_entry_by_token", { p_cancel_token_hash: waitlistToken });
    expect(leave.error).toBeNull();

    const cancel = await admin.rpc("cancel_booking_by_public_code", {
      p_code: publicCode,
      p_cancel_token_hash: bookingToken,
    });
    expect(cancel.error).toBeNull();
    expect(cancel.data?.status).toBe("cancelled");
  });
});

describe("um teste por pessoa", () => {
  const phone = randomCelular();
  const gmailLocal = `trial.gmail.${stamp}`;

  it("nega o segundo teste pelo mesmo telefone e pelo mesmo e-mail, mesmo depois de excluir a conta", async () => {
    const first = await createOwner(`${gmailLocal}@gmail.com`);
    const original = await createBusiness(first, phone, "primeiro");
    expect(original.trial_ends_at).not.toBeNull();

    // Excluir a conta apaga o negócio (cascade), mas não o registro.
    const deleted = await admin.auth.admin.deleteUser(first);
    expect(deleted.error).toBeNull();
    const gone = await admin.from("businesses").select("id").eq("id", original.id);
    expect(gone.data).toEqual([]);

    // Mesmo telefone, em outro formato, com outro e-mail.
    const samePhoneOwner = await createOwner(`trial.outro.${stamp}@agendfined.dev`);
    const samePhone = await createBusiness(samePhoneOwner, `+55 (${phone.slice(0, 2)}) ${phone.slice(2)}`, "telefone");
    expect(samePhone.trial_ends_at).toBeNull();
    expect(await hasAccess(samePhone.id)).toBe(false);

    // Mesmo Gmail sem os pontos, com +tag e em maiúsculas, com outro telefone.
    const sameEmailOwner = await createOwner(`${gmailLocal.replaceAll(".", "").toUpperCase()}+novo@GoogleMail.com`);
    const sameEmail = await createBusiness(sameEmailOwner, randomCelular(), "email");
    expect(sameEmail.trial_ends_at).toBeNull();
    expect(await hasAccess(sameEmail.id)).toBe(false);
  });

  it("o suporte concede um teste novo manualmente", async () => {
    const owner = await createOwner(`trial.manual.${stamp}@agendfined.dev`);
    const business = await createBusiness(owner, phone, "manual");
    expect(business.trial_ends_at).toBeNull();

    const { data, error } = await admin.rpc("grant_business_trial", { p_business_id: business.id });
    expect(error).toBeNull();
    const granted = new Date(data!).getTime();
    expect(Math.abs(granted - (Date.now() + 30 * DAY_MS))).toBeLessThan(60_000);
    expect(await hasAccess(business.id)).toBe(true);

    const invalid = await admin.rpc("grant_business_trial", { p_business_id: business.id, p_days: 0 });
    expect(String(invalid.error?.message)).toContain("INVALID_TRIAL_DAYS");
  });
});

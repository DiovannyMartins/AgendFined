import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomInt } from "node:crypto";
import { adminClient, retryOnFk } from "./index";

// Avisos de fim do teste grátis (#261, fase 5; FR-014): a janela de cada aviso
// em datas do fuso do negócio, um envio por negócio, período e tipo, e nada
// para assinantes, carência vigente nem negócios sem teste finito. O relógio é
// fixado com p_now numa data em que nenhum negócio real termina o teste.
const stamp = `${Date.now().toString().slice(-8)}${randomInt(100, 999)}`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

let admin: ReturnType<typeof adminClient>;
const ownerIds: string[] = [];
let counter = 0;

type Claimed = {
  send_id: string;
  claim_token: string;
  kind: string;
  days_left: number;
  business_id: string;
  business_name: string;
  business_timezone: string;
  trial_ends_at: string;
  owner_email: string | null;
};

const ownerEmailOf = (n: number) => `aviso.teste.${n}.${stamp}@agendfined.test`;

// One negócio per dono (businesses_owner_id_key).
async function createBusiness(trialEndsAt: string | null, timezone = "America/Sao_Paulo") {
  counter += 1;
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email: ownerEmailOf(counter),
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError || !user.user) throw userError ?? new Error("createUser");
  const ownerId = user.user.id;
  ownerIds.push(ownerId);
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dono Aviso" }, { onConflict: "id" });
  return retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: `Aviso ${counter}`,
        slug: `aviso-teste-${counter}-${stamp}`,
        phone: `119${randomInt(10_000_000, 99_999_999)}`,
        timezone,
        trial_ends_at: trialEndsAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(`business insert: ${error.message}`);
    return data.id;
  });
}

// Only the rows of the negócios this test owns; the claim is global.
async function claim(now: string, businessIds: string[]): Promise<Claimed[]> {
  const { data, error } = await admin.rpc("claim_trial_reminders", { p_now: now });
  expect(error).toBeNull();
  return ((data ?? []) as Claimed[]).filter((row) => businessIds.includes(row.business_id));
}

async function markSent(row: Claimed) {
  const { data, error } = await admin.rpc("mark_trial_reminder_sent", {
    p_send_id: row.send_id,
    p_claim_token: row.claim_token,
  });
  expect(error).toBeNull();
  return data;
}

async function addSubscription(businessId: string, status: string, gracePeriodEnd: string | null) {
  const { data, error } = await admin
    .from("subscriptions")
    .insert({
      business_id: businessId,
      mp_preapproval_id: `aviso-${status}-${stamp}-${randomInt(1000, 9999)}`,
      status: status as "authorized",
      grace_period_end: gracePeriodEnd,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  await admin.from("businesses").update({ current_subscription_id: data!.id }).eq("id", businessId);
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

describe("janela de cada aviso", () => {
  // Teste acaba em 10/03/2027 às 12:00 em Brasília (UTC−3).
  const TRIAL_ENDS_AT = "2027-03-10T15:00:00Z";
  let businessId = "";

  beforeAll(async () => {
    businessId = await createBusiness(TRIAL_ENDS_AT);
  });

  it("sai uma vez em D-3, D-1 e D0 e nunca duas vezes o mesmo aviso", async () => {
    // 06/03 às 23:59 em Brasília: faltam 4 dias, nada ainda.
    expect(await claim("2027-03-07T02:59:00Z", [businessId])).toEqual([]);

    // 07/03 às 00:30 em Brasília: D-3.
    const [d3] = await claim("2027-03-07T03:30:00Z", [businessId]);
    expect(d3).toMatchObject({
      kind: "trial_ends_in_3_days",
      days_left: 3,
      business_timezone: "America/Sao_Paulo",
      owner_email: ownerEmailOf(1),
    });
    expect(new Date(d3.trial_ends_at).toISOString()).toBe("2027-03-10T15:00:00.000Z");
    expect(await markSent(d3)).toBe(true);
    // Mesmo dia e dia seguinte (faltam 2): o D-3 já saiu.
    expect(await claim("2027-03-07T20:00:00Z", [businessId])).toEqual([]);
    expect(await claim("2027-03-08T12:00:00Z", [businessId])).toEqual([]);

    // 09/03: D-1.
    const [d1] = await claim("2027-03-09T12:00:00Z", [businessId]);
    expect(d1).toMatchObject({ kind: "trial_ends_in_1_day", days_left: 1 });
    expect(await markSent(d1)).toBe(true);
    // 10/03 de manhã, antes do fim: ainda é a janela do D-1, que já saiu.
    expect(await claim("2027-03-10T13:00:00Z", [businessId])).toEqual([]);

    // 10/03 às 12:00: o teste acabou.
    const [d0] = await claim("2027-03-10T15:00:00Z", [businessId]);
    expect(d0).toMatchObject({ kind: "trial_ended", days_left: 0 });
    expect(await markSent(d0)).toBe(true);
    expect(await markSent(d0)).toBe(false);
    expect(await claim("2027-03-11T15:00:00Z", [businessId])).toEqual([]);
  });

  it("não manda o D0 de um teste que acabou há mais de 3 dias", async () => {
    const old = await createBusiness("2027-03-01T15:00:00Z");
    expect(await claim("2027-03-04T15:00:01Z", [old])).toEqual([]);
  });

  it("um cron parado no D-3 manda só o D-1 depois", async () => {
    const late = await createBusiness("2027-03-20T15:00:00Z");
    const rows = await claim("2027-03-19T12:00:00Z", [late]);
    expect(rows.map((row) => row.kind)).toEqual(["trial_ends_in_1_day"]);
  });
});

describe("fuso do negócio", () => {
  it("conta os dias na data local de cada negócio", async () => {
    // 10/04 às 01:30 em Noronha (UTC−2), 09/04 às 22:30 em Rio Branco (UTC−5).
    const trialEndsAt = "2027-04-10T03:30:00Z";
    const noronha = await createBusiness(trialEndsAt, "America/Noronha");
    const rioBranco = await createBusiness(trialEndsAt, "America/Rio_Branco");

    // 06/04 em ambos: Noronha faltam 4 dias, Rio Branco faltam 3.
    const rows = await claim("2027-04-06T12:00:00Z", [noronha, rioBranco]);
    expect(rows.map((row) => [row.business_id, row.kind, row.days_left])).toEqual([
      [rioBranco, "trial_ends_in_3_days", 3],
    ]);
  });
});

describe("idempotência com falha no meio", () => {
  it("um claim sem marcação fica reservado até o lease vencer e volta com o mesmo id", async () => {
    const businessId = await createBusiness("2027-05-10T15:00:00Z");
    const [first] = await claim("2027-05-09T12:00:00Z", [businessId]);
    expect(first.kind).toBe("trial_ends_in_1_day");

    // O app caiu antes de marcar: o próximo tick, dentro do lease, não reenvia.
    expect(await claim("2027-05-09T12:30:00Z", [businessId])).toEqual([]);

    // Lease vencido: o mesmo envio volta com outro token; o token antigo não marca.
    await admin
      .from("trial_reminder_sends")
      .update({ claimed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
      .eq("id", first.send_id);
    const [retry] = await claim("2027-05-09T13:00:00Z", [businessId]);
    expect(retry.send_id).toBe(first.send_id);
    expect(retry.claim_token).not.toBe(first.claim_token);
    expect(await markSent(first)).toBe(false);
    expect(await markSent(retry)).toBe(true);
    expect(await claim("2027-05-09T14:00:00Z", [businessId])).toEqual([]);
  });

  it("um teste novo concedido pelo suporte manda os avisos de novo", async () => {
    const businessId = await createBusiness("2027-06-10T15:00:00Z");
    const [ended] = await claim("2027-06-10T16:00:00Z", [businessId]);
    expect(ended.kind).toBe("trial_ended");
    expect(await markSent(ended)).toBe(true);

    const { data: newEnd, error } = await admin.rpc("grant_business_trial", { p_business_id: businessId, p_days: 3 });
    expect(error).toBeNull();
    const next = new Date(new Date(newEnd as string).getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rows = await claim(next, [businessId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("trial_ends_in_1_day");
  });
});

describe("quem não recebe", () => {
  const NOW = "2027-07-09T12:00:00Z";
  const TRIAL_ENDS_AT = "2027-07-10T15:00:00Z";

  it("assinante, carência vigente e negócio sem teste", async () => {
    const authorized = await createBusiness(TRIAL_ENDS_AT);
    await addSubscription(authorized, "authorized", null);
    const inGrace = await createBusiness(TRIAL_ENDS_AT);
    await addSubscription(inGrace, "paused", "2027-08-01T00:00:00Z");
    const graceOver = await createBusiness(TRIAL_ENDS_AT);
    await addSubscription(graceOver, "cancelled", "2027-07-01T00:00:00Z");
    const noTrial = await createBusiness(null);

    const rows = await claim(NOW, [authorized, inGrace, graceOver, noTrial]);
    expect(rows.map((row) => row.business_id)).toEqual([graceOver]);
  });
});

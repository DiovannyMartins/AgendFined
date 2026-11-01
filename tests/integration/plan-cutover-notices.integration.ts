import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomInt } from "node:crypto";
import { adminClient, anonClient, retryOnFk } from "./index";

// E-mail da virada (#261, fase 7; FR-017): a migration põe na fila um envio
// por negócio do antigo Grátis (tests/sql/plan-cutover.sql cobre quem entra).
// Aqui: o envio sai uma vez, um claim sem marcação volta com o mesmo id, e não
// sai para quem assinou depois da virada nem para um teste trocado ou vencido.
// A fila é preenchida pelo service role, como a migration faz.
const stamp = `${Date.now().toString().slice(-8)}${randomInt(100, 999)}`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const TRIAL_ENDS_AT = new Date(Date.now() + 30 * 86_400_000).toISOString();

let admin: ReturnType<typeof adminClient>;
const ownerIds: string[] = [];
let counter = 0;

type Claimed = {
  send_id: string;
  claim_token: string;
  business_id: string;
  business_name: string;
  business_timezone: string;
  trial_ends_at: string;
  owner_email: string | null;
};

const ownerEmailOf = (n: number) => `virada.teste.${n}.${stamp}@agendfined.test`;

// One negócio per dono (businesses_owner_id_key), with the virada already queued.
async function createQueued(trialEndsAt = TRIAL_ENDS_AT, queuedTrialEndsAt = trialEndsAt) {
  counter += 1;
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email: ownerEmailOf(counter),
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError || !user.user) throw userError ?? new Error("createUser");
  const ownerId = user.user.id;
  ownerIds.push(ownerId);
  await admin.from("profiles").upsert({ id: ownerId, display_name: "Dono Virada" }, { onConflict: "id" });
  const businessId = await retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: `Virada ${counter}`,
        slug: `virada-teste-${counter}-${stamp}`,
        phone: `119${randomInt(10_000_000, 99_999_999)}`,
        timezone: "America/Sao_Paulo",
        trial_ends_at: trialEndsAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(`business insert: ${error.message}`);
    return data.id;
  });
  const { error } = await admin.from("plan_cutover_notices").insert({ business_id: businessId, trial_ends_at: queuedTrialEndsAt });
  expect(error).toBeNull();
  return businessId;
}

// Only the rows of the negócios this test owns; the claim is global.
async function claim(businessIds: string[], leaseSeconds?: number): Promise<Claimed[]> {
  const { data, error } = await admin.rpc("claim_plan_cutover_notices", {
    p_limit: 100,
    ...(leaseSeconds ? { p_lease_seconds: leaseSeconds } : {}),
  });
  expect(error).toBeNull();
  return ((data ?? []) as Claimed[]).filter((row) => businessIds.includes(row.business_id));
}

async function markSent(row: Pick<Claimed, "send_id" | "claim_token">) {
  const { data, error } = await admin.rpc("mark_plan_cutover_notice_sent", {
    p_send_id: row.send_id,
    p_claim_token: row.claim_token,
  });
  expect(error).toBeNull();
  return data;
}

// The lease is at least 60 s; the test moves claimed_at back instead of waiting.
async function expireLease(sendId: string) {
  const { error } = await admin
    .from("plan_cutover_notices")
    .update({ claimed_at: new Date(Date.now() - 3_600_000).toISOString() })
    .eq("id", sendId);
  expect(error).toBeNull();
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

describe("envio do e-mail da virada", () => {
  it("sai uma vez, com o fim do teste e o e-mail do dono", async () => {
    const businessId = await createQueued();

    const [row] = await claim([businessId]);
    expect(row).toMatchObject({
      business_id: businessId,
      business_name: `Virada ${counter}`,
      business_timezone: "America/Sao_Paulo",
      owner_email: ownerEmailOf(counter),
    });
    expect(new Date(row.trial_ends_at).toISOString()).toBe(TRIAL_ENDS_AT);
    expect(await markSent(row)).toBe(true);
    expect(await markSent(row)).toBe(false);

    // Nem com o lease vencido ele volta.
    await expireLease(row.send_id);
    expect(await claim([businessId])).toEqual([]);
  });

  it("um claim sem marcação não volta dentro do lease e depois volta com o mesmo id", async () => {
    const businessId = await createQueued();

    const [first] = await claim([businessId]);
    expect(first).toBeDefined();
    expect(await claim([businessId])).toEqual([]);

    await expireLease(first.send_id);
    const [second] = await claim([businessId]);
    expect(second.send_id).toBe(first.send_id);
    expect(second.claim_token).not.toBe(first.claim_token);
    // O token antigo não marca mais.
    expect(await markSent(first)).toBe(false);
    expect(await markSent(second)).toBe(true);
  });

  it("para depois de 5 tentativas", async () => {
    const businessId = await createQueued();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const [row] = await claim([businessId]);
      expect(row).toBeDefined();
      await expireLease(row.send_id);
    }
    expect(await claim([businessId])).toEqual([]);
  });
});

describe("quem não recebe", () => {
  it("quem assinou depois da virada, teste trocado pelo suporte e teste já vencido", async () => {
    const subscribed = await createQueued();
    const { data: subscription, error } = await admin
      .from("subscriptions")
      .insert({ business_id: subscribed, mp_preapproval_id: `virada-${stamp}`, status: "authorized" })
      .select("id")
      .single();
    expect(error).toBeNull();
    await admin.from("businesses").update({ current_subscription_id: subscription!.id }).eq("id", subscribed);

    const regranted = await createQueued(new Date(Date.now() + 60 * 86_400_000).toISOString(), TRIAL_ENDS_AT);
    const ended = await createQueued(new Date(Date.now() - 86_400_000).toISOString());
    const due = await createQueued();

    const rows = await claim([subscribed, regranted, ended, due]);
    expect(rows.map((row) => row.business_id)).toEqual([due]);
  });

  it("um negócio sem envio na fila não recebe nada", async () => {
    const queued = await createQueued();
    const { data: notice } = await admin.from("plan_cutover_notices").select("id").eq("business_id", queued).single();
    await admin.from("plan_cutover_notices").delete().eq("id", notice!.id);

    expect(await claim([queued])).toEqual([]);
  });
});

describe("postura", () => {
  it("anônimo não chama as RPCs nem lê a fila", async () => {
    const anon = anonClient();

    const claimed = await anon.rpc("claim_plan_cutover_notices", { p_limit: 1 });
    expect(claimed.error).not.toBeNull();
    const read = await anon.from("plan_cutover_notices").select("id").limit(1);
    expect(read.data ?? []).toEqual([]);
  });
});

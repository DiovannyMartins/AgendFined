import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, anonClientForUser, retryOnFk, ACTIVE_TRIAL_ENDS_AT } from "./index";

// Slug antigo (ADR 0007): a troca de slug guarda o anterior em
// business_slug_history, o link antigo redireciona para o slug atual e nenhum
// outro negócio pode tomar o slug antigo enquanto o negócio existir.
const stamp = Date.now().toString().slice(-8);
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;

const SLUG_X = `historico-x-${stamp}`;
const SLUG_Y = `historico-y-${stamp}`;
const SLUG_Z = `historico-z-${stamp}`;

let admin: ReturnType<typeof adminClient>;
const userIds: string[] = [];
const businessIds: string[] = [];
let businessA = "";
let businessB = "";

async function makeOwner(prefix: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${prefix}.${stamp}@agendfined.dev`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data?.user?.id) throw new Error(`owner ${prefix}: ${error?.message ?? "no id"}`);
  userIds.push(data.user.id);
  const profile = await admin.from("profiles").upsert({ id: data.user.id, display_name: prefix }, { onConflict: "id" });
  if (profile.error) throw new Error(`profile ${prefix}: ${profile.error.message}`);
  return data.user.id;
}

async function makeBusiness(ownerId: string, slug: string) {
  return retryOnFk(async () => {
    const { data, error } = await admin
      .from("businesses")
      .insert({ owner_id: ownerId, name: `Negócio ${slug}`, slug, phone: "+5511977777777", trial_ends_at: ACTIVE_TRIAL_ENDS_AT })
      .select("id")
      .single();
    if (error) throw new Error(`business ${slug}: ${error.message}`);
    businessIds.push(data.id);
    return data.id;
  });
}

async function renameAsOwner(prefix: string, businessId: string, slug: string) {
  const owner = await anonClientForUser(`${prefix}.${stamp}@agendfined.dev`, PASSWORD);
  return owner.from("businesses").update({ slug }).eq("id", businessId).select("slug");
}

async function redirectTarget(slug: string) {
  const { data, error } = await anonClient().rpc("get_business_slug_redirect", { p_slug: slug });
  expect(error).toBeNull();
  return data?.map((row) => row.slug) ?? [];
}

beforeAll(async () => {
  admin = adminClient();
  businessA = await makeBusiness(await makeOwner("historicoa"), SLUG_X);
  businessB = await makeBusiness(await makeOwner("historicob"), `historico-b-${stamp}`);
});

afterAll(async () => {
  await admin.from("businesses").delete().in("id", businessIds);
  await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id).catch(() => undefined)));
});

describe("histórico de slugs (ADR 0007)", () => {
  it("leva o slug antigo ao slug atual depois que o dono troca o slug", async () => {
    const { data, error } = await renameAsOwner("historicoa", businessA, SLUG_Y);
    expect(error).toBeNull();
    expect(data).toEqual([{ slug: SLUG_Y }]);

    const { data: current } = await anonClient().rpc("get_public_business", { p_slug: SLUG_X });
    expect(current).toEqual([]);
    expect(await redirectTarget(SLUG_X)).toEqual([SLUG_Y]);
  });

  it("não deixa outro negócio tomar o slug antigo, nem por update nem por insert", async () => {
    const { error: updateError } = await renameAsOwner("historicob", businessB, SLUG_X);
    expect(updateError?.code).toBe("23505");

    const { error: insertError } = await admin
      .from("businesses")
      .insert({ owner_id: await makeOwner("historicoc"), name: "Intruso", slug: SLUG_X, phone: "+5511977777777", trial_ends_at: ACTIVE_TRIAL_ENDS_AT });
    expect(insertError?.code).toBe("23505");

    expect(await redirectTarget(SLUG_X)).toEqual([SLUG_Y]);
  });

  it("segue trocas encadeadas até o slug atual", async () => {
    const { error } = await renameAsOwner("historicoa", businessA, SLUG_Z);
    expect(error).toBeNull();

    expect(await redirectTarget(SLUG_X)).toEqual([SLUG_Z]);
    expect(await redirectTarget(SLUG_Y)).toEqual([SLUG_Z]);
  });

  it("deixa o próprio negócio voltar a um slug antigo", async () => {
    const { error } = await renameAsOwner("historicoa", businessA, SLUG_X);
    expect(error).toBeNull();

    const { data: current } = await anonClient().rpc("get_public_business", { p_slug: SLUG_X });
    expect(current?.[0]?.id).toBe(businessA);
    expect(await redirectTarget(SLUG_X)).toEqual([]);
    expect(await redirectTarget(SLUG_Z)).toEqual([SLUG_X]);
  });

  it("não redireciona para um negócio inativo", async () => {
    await admin.from("businesses").update({ is_active: false }).eq("id", businessA);
    try {
      expect(await redirectTarget(SLUG_Z)).toEqual([]);
    } finally {
      await admin.from("businesses").update({ is_active: true }).eq("id", businessA);
    }
  });

  it("mantém o histórico fechado para anon e para outros donos", async () => {
    const { data: anonRows, error: anonError } = await anonClient()
      .from("business_slug_history")
      .select("slug")
      .limit(1);
    expect(anonRows).toBeNull();
    expect(anonError).not.toBeNull();

    const owner = await anonClientForUser(`historicob.${stamp}@agendfined.dev`, PASSWORD);
    const { data: ownerRows, error: ownerError } = await owner.from("business_slug_history").select("slug").limit(1);
    expect(ownerRows).toBeNull();
    expect(ownerError).not.toBeNull();
  });

  it("libera os slugs antigos quando o negócio é excluído", async () => {
    await admin.from("businesses").delete().eq("id", businessA);

    expect(await redirectTarget(SLUG_Z)).toEqual([]);
    const { error } = await renameAsOwner("historicob", businessB, SLUG_Z);
    expect(error).toBeNull();
  });
});

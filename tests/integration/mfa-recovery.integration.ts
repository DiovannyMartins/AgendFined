import { createHmac, randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "@/lib/auth/recovery-codes";
import { adminClient, anonClientForUser } from "./index";

// #169 (ADR 0009): códigos de recuperação guardados como digest, gastos uma
// única vez, e a saída do dono que perdeu o autenticador.
const admin = adminClient();
const stamp = randomBytes(5).toString("hex");
const password = `Test-${stamp}-Strong-9!`;
const createdUsers: string[] = [];
let businessId = "";

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const letter of secret.toUpperCase().replace(/=+$/, "")) {
    value = (value << 5) | alphabet.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

afterAll(async () => {
  const errors: string[] = [];
  if (businessId) {
    const { error } = await admin.from("businesses").delete().eq("id", businessId);
    if (error) errors.push(`business: ${error.message}`);
  }
  for (const id of createdUsers.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) errors.push(`user: ${error.message}`);
  }
  if (errors.length) throw new Error(`Test cleanup failed: ${errors.join("; ")}`);
});

async function count(userId: string) {
  const { data, error } = await admin.rpc("count_mfa_recovery_codes", { p_user_id: userId });
  if (error) throw error;
  return data;
}

async function consume(userId: string, code: string) {
  const { data, error } = await admin.rpc("consume_mfa_recovery_code", {
    p_user_id: userId,
    p_code_hash: hashRecoveryCode(userId, normalizeRecoveryCode(code)!),
  });
  if (error) throw error;
  return data;
}

describe("códigos de recuperação do MFA (#169)", () => {
  it("guarda só digests, gasta cada código uma vez e libera o dono depois de remover o fator", async () => {
    const email = `recovery-${stamp}@agendfined.dev`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) throw createError;
    const userId = created.user.id;
    createdUsers.push(userId);
    const profile = await admin.from("profiles").upsert({ id: userId, display_name: "recovery" });
    if (profile.error) throw profile.error;
    const { data: business, error: businessError } = await admin.from("businesses").insert({
      owner_id: userId,
      name: `Recovery ${stamp}`,
      slug: `recovery-${stamp}`,
      phone: "+5511999999999",
    }).select("id").single();
    if (businessError || !business) throw businessError;
    businessId = business.id;
    const { data: service, error: serviceError } = await admin.from("services").insert({
      business_id: businessId,
      name: "Corte",
      duration_minutes: 30,
      price_cents: 1000,
    }).select("id").single();
    if (serviceError || !service) throw serviceError;

    const owner = await anonClientForUser(email, password);
    const enrolled = await owner.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data) throw enrolled.error;
    const challenge = await owner.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenge.error || !challenge.data) throw challenge.error;
    const verified = await owner.auth.mfa.verify({
      factorId: enrolled.data.id, challengeId: challenge.data.id, code: totp(enrolled.data.totp.secret),
    });
    if (verified.error) throw verified.error;

    const { codes, hashes } = generateRecoveryCodes(userId);
    const replaced = await admin.rpc("replace_mfa_recovery_codes", { p_user_id: userId, p_code_hashes: hashes });
    expect(replaced.error).toBeNull();
    expect(await count(userId)).toBe(10);
    const stored = await admin.from("mfa_recovery_codes").select("code_hash").eq("user_id", userId);
    expect(stored.data?.map((row) => row.code_hash).sort()).toEqual([...hashes].sort());

    // The browser, even signed in as the dono, never reaches the digests.
    const ownTable = await owner.from("mfa_recovery_codes").select("code_hash");
    expect(ownTable.error).not.toBeNull();
    for (const [fn, args] of [
      ["count_mfa_recovery_codes", { p_user_id: userId }],
      ["consume_mfa_recovery_code", { p_user_id: userId, p_code_hash: hashes[0] }],
      ["clear_mfa_recovery_codes", { p_user_id: userId }],
      ["replace_mfa_recovery_codes", { p_user_id: userId, p_code_hashes: hashes }],
    ] as const) {
      const { error } = await owner.rpc(fn, args as never);
      expect(error, fn).not.toBeNull();
    }
    expect(await count(userId)).toBe(10);

    const tooFew = await admin.rpc("replace_mfa_recovery_codes", { p_user_id: userId, p_code_hashes: hashes.slice(1) });
    expect(tooFew.error?.message).toContain("INVALID_RECOVERY_CODES");

    expect(await consume(userId, "ZZZZZ-ZZZZZ")).toBe(false);
    expect(await consume(userId, codes[0].toLowerCase())).toBe(true);
    expect(await consume(userId, codes[0])).toBe(false);
    const race = await Promise.all([consume(userId, codes[1]), consume(userId, codes[1])]);
    expect(race.filter(Boolean)).toHaveLength(1);
    expect(await count(userId)).toBe(8);

    // Lost authenticator: password-only session, then the factor goes away.
    await owner.auth.signOut();
    const ownerAal1 = await anonClientForUser(email, password);
    expect((await ownerAal1.from("services").select("id").eq("id", service.id)).data).toHaveLength(0);
    const { data: factors, error: factorsError } = await admin.auth.admin.mfa.listFactors({ userId });
    if (factorsError) throw factorsError;
    for (const factor of factors.factors) {
      const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
      expect(error).toBeNull();
    }
    // The session keeps the old user (with the factor) until it is refreshed,
    // which is why redeemMfaRecoveryCode refreshes it.
    const stale = await ownerAal1.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(stale.data).toMatchObject({ currentLevel: "aal1", nextLevel: "aal2" });
    expect((await ownerAal1.auth.refreshSession()).error).toBeNull();
    const assurance = await ownerAal1.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(assurance.data).toMatchObject({ currentLevel: "aal1", nextLevel: "aal1" });
    const allowed = await ownerAal1.from("services").select("id").eq("id", service.id);
    expect(allowed.error).toBeNull();
    expect(allowed.data).toHaveLength(1);

    expect((await admin.rpc("clear_mfa_recovery_codes", { p_user_id: userId })).error).toBeNull();
    expect(await count(userId)).toBe(0);
  }, 120_000);
});

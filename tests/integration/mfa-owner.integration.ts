import { createHmac, randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClientForUser, verifyTotpThroughApp } from "./index";

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

async function createUser(label: string) {
  const email = `security-${label}-${stamp}@agendfined.dev`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create ${label}: ${error?.message}`);
  createdUsers.push(data.user.id);
  const profile = await admin.from("profiles").upsert({ id: data.user.id, display_name: label });
  if (profile.error) throw profile.error;
  return { id: data.user.id, email };
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

describe("MFA and owner-only business access with disposable accounts", () => {
  it("allows the owner, isolates another user, and requires AAL2 after TOTP enrollment", async () => {
    const owner = await createUser("owner");
    const outsider = await createUser("outsider");

    const { data: business, error: businessError } = await admin.from("businesses").insert({
      owner_id: owner.id,
      name: `Security ${stamp}`,
      slug: `security-${stamp}`,
      phone: "+5511999999999",
    }).select("id").single();
    if (businessError || !business) throw businessError;
    businessId = business.id;

    const { data: service, error: serviceError } = await admin.from("services").insert({
      business_id: businessId,
      name: "Original",
      duration_minutes: 30,
      price_cents: 1000,
    }).select("id").single();
    if (serviceError || !service) throw serviceError;

    const ownerClient = await anonClientForUser(owner.email, password);
    const outsiderClient = await anonClientForUser(outsider.email, password);

    const ownerCanSee = await ownerClient.from("services").select("id").eq("id", service.id);
    expect(ownerCanSee.error).toBeNull();
    expect(ownerCanSee.data).toHaveLength(1);
    const outsiderCannotSee = await outsiderClient.from("services").select("id").eq("id", service.id);
    expect(outsiderCannotSee.data).toHaveLength(0);
    const outsiderCannotEdit = await outsiderClient.from("services").update({ name: "Unauthorized" }).eq("id", service.id).select("id");
    expect(outsiderCannotEdit.data).toHaveLength(0);
    const ownerCanEdit = await ownerClient.from("services").update({ name: "Owner changed" }).eq("id", service.id).select("id");
    expect(ownerCanEdit.error).toBeNull();
    expect(ownerCanEdit.data).toHaveLength(1);

    const enrolled = await ownerClient.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data) throw enrolled.error;
    const { id: factorId, totp: factor } = enrolled.data;
    const enrollmentVerify = await verifyTotpThroughApp(ownerClient, admin, factorId, totp(factor.secret));
    if (enrollmentVerify.error) throw enrollmentVerify.error;

    await ownerClient.auth.signOut();
    const ownerAal1 = await anonClientForUser(owner.email, password);
    const assurance = await ownerAal1.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(assurance.data?.currentLevel).toBe("aal1");
    expect(assurance.data?.nextLevel).toBe("aal2");
    const blocked = await ownerAal1.from("services").select("id").eq("id", service.id);
    expect(blocked.data).toHaveLength(0);

    const loginVerify = await verifyTotpThroughApp(ownerAal1, admin, factorId, totp(factor.secret));
    if (loginVerify.error) throw loginVerify.error;
    const allowed = await ownerAal1.from("services").select("id").eq("id", service.id);
    expect(allowed.error).toBeNull();
    expect(allowed.data).toHaveLength(1);
    expect((await ownerAal1.rpc("current_session_mfa_verified")).data).toBe(true);

    // GHSA-vjcg: the code confirmed straight against Supabase Auth skips the
    // app's attempt limit. Auth still issues aal2, but the database does not
    // accept it, and the app refuses to verify for a while afterwards.
    const direct = await anonClientForUser(owner.email, password);
    const directChallenge = await direct.auth.mfa.challenge({ factorId });
    if (directChallenge.error || !directChallenge.data) throw directChallenge.error;
    const directVerify = await direct.auth.mfa.verify({
      factorId, challengeId: directChallenge.data.id, code: totp(factor.secret),
    });
    if (directVerify.error) throw directVerify.error;
    expect((await direct.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe("aal2");
    expect((await direct.from("services").select("id").eq("id", service.id)).data).toHaveLength(0);
    expect((await direct.rpc("current_session_mfa_verified")).data).toBe(false);
    await expect(verifyTotpThroughApp(direct, admin, factorId, totp(factor.secret))).rejects.toThrow("refused");

    // Nor can that session drop the factor to fall back to a password-only account.
    expect((await direct.auth.mfa.unenroll({ factorId })).error).not.toBeNull();
    const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: owner.id });
    expect(factors?.factors.map((f) => f.id)).toContain(factorId);

    // The session confirmed through the app keeps its access.
    expect((await ownerAal1.from("services").select("id").eq("id", service.id)).data).toHaveLength(1);
    expect((await ownerAal1.rpc("current_session_mfa_verified")).data).toBe(true);
  }, 120_000);

  it("registers only a challenge of the user's own factor and session", async () => {
    const owner = await createUser("grant-owner");
    const other = await createUser("grant-other");
    const ownerClient = await anonClientForUser(owner.email, password);
    const otherClient = await anonClientForUser(other.email, password);
    const enrolled = await ownerClient.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data) throw enrolled.error;
    const challenge = await ownerClient.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenge.error || !challenge.data) throw challenge.error;
    const { data: otherClaims } = await otherClient.auth.getClaims();
    const otherSession = String(otherClaims?.claims.session_id);

    const wrongSession = await admin.rpc("grant_mfa_challenge", {
      p_user_id: owner.id, p_session_id: otherSession, p_challenge_id: challenge.data.id,
    });
    expect(wrongSession.error?.message).toContain("INVALID_MFA_CHALLENGE");
    const wrongUser = await admin.rpc("grant_mfa_challenge", {
      p_user_id: other.id, p_session_id: otherSession, p_challenge_id: challenge.data.id,
    });
    expect(wrongUser.error?.message).toContain("INVALID_MFA_CHALLENGE");
    const fromBrowser = await ownerClient.rpc("grant_mfa_challenge", {
      p_user_id: owner.id, p_session_id: otherSession, p_challenge_id: challenge.data.id,
    });
    expect(fromBrowser.error).not.toBeNull();
    const removalFromBrowser = await ownerClient.rpc("grant_mfa_factor_removal", {
      p_user_id: owner.id, p_factor_id: enrolled.data.id,
    });
    expect(removalFromBrowser.error).not.toBeNull();
  }, 60_000);
});
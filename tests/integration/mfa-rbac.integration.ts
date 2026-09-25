import { createHmac, randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClientForUser } from "./index";

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

describe("MFA and business RBAC with disposable accounts", () => {
  it("enforces admin, editor, user and AAL2 at the Data API", async () => {
    const owner = await createUser("owner");
    const teamAdmin = await createUser("admin");
    const editor = await createUser("editor");
    const reader = await createUser("reader");
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

    const membership = await admin.from("business_memberships").insert([
      { business_id: businessId, user_id: teamAdmin.id, role: "admin" },
      { business_id: businessId, user_id: editor.id, role: "editor" },
      { business_id: businessId, user_id: reader.id, role: "user" },
    ]);
    if (membership.error) throw membership.error;

    const ownerClient = await anonClientForUser(owner.email, password);
    const adminClient = await anonClientForUser(teamAdmin.email, password);
    const editorClient = await anonClientForUser(editor.email, password);
    const readerClient = await anonClientForUser(reader.email, password);
    const outsiderClient = await anonClientForUser(outsider.email, password);

    const ownerCanSee = await ownerClient.from("business_memberships").select("user_id").eq("business_id", businessId);
    expect(ownerCanSee.error).toBeNull();
    expect(ownerCanSee.data).toHaveLength(3);
    const readerCanSee = await readerClient.from("services").select("id").eq("id", service.id);
    expect(readerCanSee.data).toHaveLength(1);
    const outsiderCannotSee = await outsiderClient.from("services").select("id").eq("id", service.id);
    expect(outsiderCannotSee.data).toHaveLength(0);

    const readerCannotEdit = await readerClient.from("services").update({ name: "Reader changed" }).eq("id", service.id).select("id");
    expect(readerCannotEdit.data).toHaveLength(0);
    const editorCanEdit = await editorClient.from("services").update({ name: "Editor changed" }).eq("id", service.id).select("id");
    expect(editorCanEdit.error).toBeNull();
    expect(editorCanEdit.data).toHaveLength(1);
    const editorCannotManageMembers = await editorClient.from("business_memberships").update({ role: "admin" }).eq("user_id", reader.id).select("user_id");
    expect(editorCannotManageMembers.data).toHaveLength(0);
    const adminCanManageMembers = await adminClient.from("business_memberships").update({ role: "editor" }).eq("user_id", reader.id).select("user_id");
    expect(adminCanManageMembers.error).toBeNull();
    expect(adminCanManageMembers.data).toHaveLength(1);

    const enrolled = await ownerClient.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data) throw enrolled.error;
    const { id: factorId, totp: factor } = enrolled.data;
    const enrollmentChallenge = await ownerClient.auth.mfa.challenge({ factorId });
    if (enrollmentChallenge.error || !enrollmentChallenge.data) throw enrollmentChallenge.error;
    const enrollmentVerify = await ownerClient.auth.mfa.verify({
      factorId, challengeId: enrollmentChallenge.data.id, code: totp(factor.secret),
    });
    if (enrollmentVerify.error) throw enrollmentVerify.error;

    await ownerClient.auth.signOut();
    const ownerAal1 = await anonClientForUser(owner.email, password);
    const assurance = await ownerAal1.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(assurance.data?.currentLevel).toBe("aal1");
    expect(assurance.data?.nextLevel).toBe("aal2");
    const blocked = await ownerAal1.from("services").select("id").eq("id", service.id);
    expect(blocked.data).toHaveLength(0);

    const loginChallenge = await ownerAal1.auth.mfa.challenge({ factorId });
    if (loginChallenge.error || !loginChallenge.data) throw loginChallenge.error;
    const loginVerify = await ownerAal1.auth.mfa.verify({
      factorId, challengeId: loginChallenge.data.id, code: totp(factor.secret),
    });
    if (loginVerify.error) throw loginVerify.error;
    const allowed = await ownerAal1.from("services").select("id").eq("id", service.id);
    expect(allowed.error).toBeNull();
    expect(allowed.data).toHaveLength(1);
  }, 120_000);
});

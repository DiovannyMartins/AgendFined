#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const CONTAINER = process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "supabase_db_projeto";
const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = "54322";

function assertLocalDatabase() {
  const host = process.env.LOCAL_SUPABASE_DB_HOST ?? LOCAL_HOST;
  const port = process.env.LOCAL_SUPABASE_DB_PORT ?? LOCAL_PORT;
  if (host !== LOCAL_HOST || port !== LOCAL_PORT || /supabase\.co|vercel|production/i.test(`${host}:${port}`)) {
    throw new Error(`REFUSING_NON_LOCAL_DATABASE: ${host}:${port}`);
  }
  console.log("LOCAL DATABASE CONFIRMED");
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psql(query) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `psql exited ${code}`)));
  });
}

async function assertLocalSchema() {
  const result = await psql("select count(*) from information_schema.tables where table_schema='public' and table_name in ('businesses','subscriptions','billing_attempts','billing_reconciliation_claims');");
  if (result !== "4") throw new Error("LOCAL_BILLING_SCHEMA_NOT_READY");
}

async function createFixtures({ validCurrentSubscription = false } = {}) {
  const ids = { user: randomUUID(), business: randomUUID(), subscription: randomUUID(), attempt: randomUUID(), key: `harness-${randomUUID()}` };
  await psql(`insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values (${sql(ids.user)}, 'authenticated', 'authenticated', ${sql(`${ids.user}@harness.invalid`)}, ${sql('not-a-login-password')}, now(), '{}'::jsonb, '{}'::jsonb); insert into public.profiles (id, display_name) values (${sql(ids.user)}, 'Harness User'); insert into public.businesses (id, owner_id, name, slug, phone) values (${sql(ids.business)}, ${sql(ids.user)}, ${sql(`harness-${ids.business}`)}, ${sql(`harness-${ids.business}`)}, '0000000000');`);
  await psql(`insert into public.subscriptions (id, business_id, mp_preapproval_id, status, plan) values (${sql(ids.subscription)}, ${sql(ids.business)}, ${sql(`harness-provider-${ids.subscription}`)}, 'pending', 'pro');`);
  if (validCurrentSubscription) {
    await psql(`update public.businesses set current_subscription_id = ${sql(ids.subscription)} where id = ${sql(ids.business)};`);
  }
  await psql(`insert into public.billing_attempts (id, business_id, kind, status, idempotency_key, expected_subscription_id) values (${sql(ids.attempt)}, ${sql(ids.business)}, 'initial', 'unknown', ${sql(ids.key)}, ${sql(ids.subscription)});`);
  return ids;
}

async function cleanup(ids) {
  if (!ids) return;
  const guard = `id = ${sql(ids.business)}`;
  await psql(`delete from public.billing_reconciliation_claims where resource_key = ${sql(`billing-attempt/${ids.attempt}`)}; delete from public.billing_attempts where business_id = ${sql(ids.business)}; delete from public.subscriptions where business_id = ${sql(ids.business)}; delete from public.businesses where ${guard}; delete from auth.users where id = ${sql(ids.user)};`);
  const remaining = await psql(`select count(*) from public.businesses where id = ${sql(ids.business)} union all select count(*) from public.subscriptions where business_id = ${sql(ids.business)} union all select count(*) from public.billing_attempts where business_id = ${sql(ids.business)} union all select count(*) from auth.users where id = ${sql(ids.user)};`);
  if (remaining.split("\n").some(value => value !== "0")) throw new Error("HARNESS_CLEANUP_INCOMPLETE");
}

async function concurrentClaim(ids) {
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const query = token => `select id || '|' || status || '|' || idempotency_key from public.claim_billing_attempt(${sql(ids.business)}, 'initial', ${sql(ids.subscription)}, ${sql(token)});`;
  const [a, b] = await Promise.all([psql(query(tokenA)), psql(query(tokenB))]);
  const active = await psql(`select count(*) from public.billing_attempts where business_id = ${sql(ids.business)} and status in ('reserved','creating','unknown','ambiguous');`);
  if (active !== "1" || a !== b) throw new Error(`BILLING_ATTEMPT_CLAIM_FAILED: active=${active}`);
  console.log(JSON.stringify({ scenario: "billing_attempt_claim", activeAttempts: Number(active), workerA: "received-result", workerB: "received-result" }));
}

async function concurrentReconciliationClaim(ids) {
  const resource = `billing-attempt/${ids.attempt}`;
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const query = token => `select public.claim_billing_reconciliation(${sql(resource)}, ${sql(token)}, 300);`;
  const [a, b] = await Promise.all([psql(query(tokenA)), psql(query(tokenB))]);
  const held = await psql(`select count(*) from public.billing_reconciliation_claims where resource_key=${sql(resource)};`);
  if (held !== "1" || ![a, b].every(value => value === "t" || value === "f")) throw new Error("RECONCILIATION_CLAIM_FAILED");
  console.log(JSON.stringify({ scenario: "reconciliation_claim", activeClaims: Number(held), workerA: a, workerB: b }));
}

async function snapshotState(ids) {
  return psql(`select json_build_object(
    'attempt', (select json_build_object('id', a.id, 'status', a.status, 'claim_token', c.claim_token, 'claim_expires_at', c.claimed_until, 'resolved_at', a.resolved_at, 'provider_preapproval_id', a.provider_preapproval_id) from public.billing_attempts a left join public.billing_reconciliation_claims c on c.resource_key = 'billing-attempt/' || a.id::text where a.id=${sql(ids.attempt)}),
    'business', (select json_build_object('plan', plan, 'current_subscription_id', current_subscription_id) from public.businesses where id=${sql(ids.business)}),
    'subscription', (select json_build_object('id', id, 'mp_preapproval_id', mp_preapproval_id, 'status', status, 'grace_period_end', grace_period_end, 'business_id', business_id) from public.subscriptions where id=${sql(ids.subscription)})
  );`);
}

function domainState(snapshot) {
  const state = JSON.parse(snapshot);
  return JSON.stringify({
    attempt: { id: state.attempt?.id, status: state.attempt?.status, resolved_at: state.attempt?.resolved_at, provider_preapproval_id: state.attempt?.provider_preapproval_id },
    business: state.business,
    subscription: state.subscription,
  });
}

async function expireReconciliationClaim(ids) {
  const resource = `billing-attempt/${ids.attempt}`;
  await psql(`update public.billing_reconciliation_claims set claimed_until = now() - interval '1 second' where resource_key=${sql(resource)};`);
}

async function fencedFinalize(ids, token) {
  const providerId = `harness-provider-${ids.subscription}`;
  return psql(`select id from public.reconcile_billing_attempt_subscription(${sql(ids.attempt)}, ${sql(providerId)}, 'authorized', now(), now() + interval '30 days', null, ${sql(token)});`);
}

async function runFencedScenario(ids, scenario) {
  console.log(`SCENARIO ${scenario} START`);
  const resource = `billing-attempt/${ids.attempt}`;
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const claimedA = await psql(`select public.claim_billing_reconciliation(${sql(resource)}, ${sql(tokenA)}, 300);`);
  if (claimedA !== "t") throw new Error(`${scenario}_WORKER_A_CLAIM_FAILED`);
  const before = await snapshotState(ids);
  await expireReconciliationClaim(ids);
  const claimedB = await psql(`select public.claim_billing_reconciliation(${sql(resource)}, ${sql(tokenB)}, 300);`);
  if (claimedB !== "t") throw new Error(`${scenario}_WORKER_B_CLAIM_FAILED`);
  const ownership = await psql(`select claim_token::text || '|' || (claimed_until > now())::text from public.billing_reconciliation_claims where resource_key=${sql(resource)};`);
  if (ownership !== `${tokenB}|true`) throw new Error(`${scenario}_FENCING_OWNERSHIP_FAILED`);
  let workerAError = "";
  try {
    await fencedFinalize(ids, tokenA);
  } catch (error) {
    workerAError = error.message;
  }
  if (!/CLAIM_LOST/.test(workerAError)) throw new Error(`${scenario}_EXPECTED_CLAIM_LOST_NOT_RECEIVED: ${workerAError}`);
  const afterA = await snapshotState(ids);
  if (domainState(afterA) !== domainState(before)) throw new Error(`${scenario}_WORKER_A_SIDE_EFFECT_DETECTED`);
  await fencedFinalize(ids, tokenB);
  const afterB = await snapshotState(ids);
  console.log(JSON.stringify({ scenario, tokenA, tokenB, workerA: "CLAIM_LOST", workerB: "AUTHORIZED", before: JSON.parse(before), afterA: JSON.parse(afterA), afterB: JSON.parse(afterB) }));
  return { tokenA, tokenB, before, afterA, afterB };
}

async function main() {
  console.log("HARNESS START");
  console.log("PRECHECK START");
  assertLocalDatabase();
  await assertLocalSchema();
  console.log("PRECHECK PASSED");
  let ids;
  const scenarioIds = [];
  try {
    ids = await createFixtures();
    scenarioIds.push(ids);
    console.log("FIXTURES CREATED");
    console.log("SCENARIO A START");
    await Promise.all([concurrentClaim(ids), concurrentReconciliationClaim(ids)]);
    console.log("SCENARIO A/B PASSED");
    const fencingIds = await createFixtures({ validCurrentSubscription: true });
    scenarioIds.push(fencingIds);
    await runFencedScenario(fencingIds, "C");
    const leaseIds = await createFixtures({ validCurrentSubscription: true });
    scenarioIds.push(leaseIds);
    await runFencedScenario(leaseIds, "D");
  } finally {
    for (const fixture of scenarioIds) await cleanup(fixture);
    console.log("CLEANUP COMPLETED");
  }
  console.log("HARNESS FINISHED");
}

const invokedPath = process.argv[1];
const entrypointPath = invokedPath ? resolve(invokedPath) : null;
if (entrypointPath && fileURLToPath(import.meta.url) === entrypointPath) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

export { assertLocalDatabase, assertLocalSchema, createFixtures, cleanup, concurrentClaim, concurrentReconciliationClaim };

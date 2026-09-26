#!/usr/bin/env node
// Restore an authenticated backup into a disposable local Supabase project.
// The container name guard prevents this helper from targeting the app's DB.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [backup, container, scope = "public"] = process.argv.slice(2);
if (!backup || !/^supabase_db_af-restore-[a-z0-9-]+$/.test(container ?? "") || !["public", "auth"].includes(scope)) {
  console.error("Usage: BACKUP_ENCRYPTION_KEY=<key> node restore-to-local-docker.mjs <backup> supabase_db_af-restore-<name> [public|auth]");
  process.exit(2);
}
if (!/^[0-9a-f]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY ?? "")) {
  console.error("BACKUP_ENCRYPTION_KEY must contain 64 hexadecimal characters.");
  process.exit(2);
}

const decryptFile = fileURLToPath(new URL("./decrypt-file.mjs", import.meta.url));
const verified = spawnSync(process.execPath, [decryptFile, backup, "--verify"], {
  env: process.env,
  encoding: "utf8",
});
if (verified.error || verified.status !== 0) {
  console.error("Encrypted backup failed authentication or gzip validation.");
  process.exit(1);
}

const emptyQuery = scope === "auth"
  ? "select (select count(*) from auth.users) + (select count(*) from auth.identities) + (select count(*) from auth.mfa_factors);"
  : "select (select count(*) from public.availability) + (select count(*) from public.availability_blocks) + (select count(*) from public.billing_attempts) + (select count(*) from public.billing_reconciliation_claims) + (select count(*) from public.booking_rate_limits) + (select count(*) from public.bookings) + (select count(*) from public.businesses) + (select count(*) from public.customers) + (select count(*) from public.profiles) + (select count(*) from public.security_usage_daily) + (select count(*) from public.services) + (select count(*) from public.subscriptions) + (select count(*) from public.waitlist_entries);";
const empty = spawnSync("docker", [
  "exec", container, "psql", "-U", "supabase_admin", "-d", "postgres", "-Atc",
  emptyQuery,
], { encoding: "utf8" });
if (empty.error || empty.status !== 0 || empty.stdout.trim() !== "0") {
  console.error("Target must be a running, empty local restore project with current migrations.");
  process.exit(1);
}

const started = performance.now();
const decrypt = spawn(process.execPath, [decryptFile, backup], {
  env: process.env,
  stdio: ["ignore", "pipe", "ignore"],
});
const restore = spawn("docker", [
  "exec", "-i", "-e", "PGOPTIONS=-c session_replication_role=replica",
  container, "psql", "-U", "supabase_admin", "-d", "postgres",
  "-v", "ON_ERROR_STOP=1", "--single-transaction", "-q",
], { stdio: ["pipe", "ignore", "ignore"] });
decrypt.stdout.pipe(restore.stdin);
restore.stdin.on("error", () => {});

function closed(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
}

const [decryptCode, restoreCode] = await Promise.all([closed(decrypt), closed(restore)]);
if (decryptCode !== 0 || restoreCode !== 0) {
  console.error(`Restore failed (decrypt=${decryptCode}, psql=${restoreCode}). The target must be reset before retrying.`);
  process.exit(1);
}
console.log(`Authenticated restore completed in ${((performance.now() - started) / 1000).toFixed(1)} s.`);

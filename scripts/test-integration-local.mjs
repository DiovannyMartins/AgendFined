// Runs the integration suite against the local Supabase stack (`supabase start`).
// Local keys from `supabase status` override .env.local, which points to the
// remote project; process.loadEnvFile never overrides variables already set.
import { execFileSync, spawnSync } from "node:child_process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

let status;
try {
  status = JSON.parse(
    execFileSync(npx, ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
    }),
  );
} catch {
  console.error("Supabase local não está rodando. Execute `npx supabase start` primeiro.");
  process.exit(1);
}

const result = spawnSync(npx, ["vitest", "run", "--project", "integration", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY ?? status.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
  },
});
process.exit(result.status ?? 1);

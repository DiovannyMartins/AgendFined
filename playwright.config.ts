import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Load .env.local so envs reach Playwright tests and the spawned `next dev`.
function loadEnvFrom(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvFrom(".env.local");

// E2E server lifecycle.
// - Default: serve the existing production build with `next start` on a
//   dedicated port (E2E_PORT, default 3100). Run `npm run build` first.
//   A dedicated port avoids silently reusing a stale `next dev` left on 3000.
// - E2E_SERVER=dev uses `next dev` instead (slower, more handles open).
// - The server is spawned with `node` directly, not through `npm run`, so the
//   process Playwright starts (and kills on exit) is the server itself and no
//   npm shim is left behind on Windows.
// - Reusing an already running server is opt-in (PLAYWRIGHT_REUSE_SERVER=1).
const port = Number(process.env.E2E_PORT ?? 3100);
const serverMode = process.env.E2E_SERVER === "dev" ? "dev" : "start";
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 60_000,
  globalTimeout: process.env.CI ? 15 * 60_000 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // When PLAYWRIGHT_BASE_URL points elsewhere (e.g. a preview deploy), no
  // local server is started.
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `node node_modules/next/dist/bin/next ${serverMode} --port ${port} --hostname 127.0.0.1`,
        url: baseURL,
        reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 740 } } },
  ],
});

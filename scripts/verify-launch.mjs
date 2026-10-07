import fs from "node:fs";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const baseUrl = (process.env.CHECK_URL || process.env.APP_URL || "https://agendfined.com.br").replace(/\/$/, "");
const productionCheck = process.argv.includes("--production");

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "REMINDER_CRON_SECRET",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "MERCADO_PAGO_NOTIFICATION_URL",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
];

const failures = [];
const warnings = [];

function pass(message) {
  console.log(`PASS  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN  ${message}`);
}

console.log(`AgendFined launch check: ${baseUrl}`);

for (const key of requiredEnvironment) {
  if (process.env[key]?.trim()) pass(`environment ${key} is configured`);
  else if (productionCheck) fail(`environment ${key} is missing`);
  else warn(`environment ${key} is missing (required only for --production)`);
}

if (process.env.CRON_SECRET?.trim() || process.env.RECONCILIATION_CRON_SECRET?.trim()) {
  pass("environment reconciliation scheduler secret is configured");
} else {
  warn("environment reconciliation scheduler secret is not configured; enable it before scheduling /api/internal/reconciliation");
}

if (productionCheck && process.env.APP_URL && !/^https:\/\//i.test(process.env.APP_URL)) {
  fail("APP_URL must use HTTPS in the launch environment");
}

if (
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID &&
  !/^G-[A-Z0-9]+$/i.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID.trim())
) {
  fail("NEXT_PUBLIC_GA_MEASUREMENT_ID must match the GA4 format G-XXXXXXXXXX");
}

if (
  process.env.MERCADO_PAGO_NOTIFICATION_URL &&
  !process.env.MERCADO_PAGO_NOTIFICATION_URL.endsWith("/api/webhooks/mercadopago")
) {
  fail("MERCADO_PAGO_NOTIFICATION_URL must end with /api/webhooks/mercadopago");
}

if (
  process.env.RESEND_FROM_EMAIL &&
  !process.env.RESEND_FROM_EMAIL.toLowerCase().includes("reservas@agendfined.com.br")
) {
  fail("RESEND_FROM_EMAIL should use reservas@agendfined.com.br for confirmations and reminders");
}

if (!productionCheck && !/^https:\/\//i.test(baseUrl)) {
  warn("public checks are running against a non-HTTPS URL; use --production for the launch domain");
}

async function checkPublicEndpoint(path, expectedStatus = 200) {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (response.status !== expectedStatus) {
      fail(`${path} returned HTTP ${response.status}, expected ${expectedStatus}`);
      return null;
    }
    pass(`${path} returned HTTP ${response.status}`);
    return response;
  } catch (error) {
    fail(`${path} could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// Exact host matching (not substring) for CSP sources and sitemap URLs.
function cspDirectiveSources(csp, name) {
  const directive = csp.split(";").map((part) => part.trim().split(/\s+/)).find(([key]) => key === name);
  return directive ? directive.slice(1) : [];
}
function sourceAllowsHost(source, host) {
  const match = /^https:\/\/(\*\.)?([^/:]+)$/.exec(source);
  if (!match) return false;
  return match[1] ? host.endsWith(`.${match[2]}`) : host === match[2];
}
function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => {
    try { return new URL(m[1]); } catch { return null; }
  }).filter(Boolean);
}

const home = await checkPublicEndpoint("/");
const robots = await checkPublicEndpoint("/robots.txt");
const sitemap = await checkPublicEndpoint("/sitemap.xml");

if (home) {
  const csp = home.headers.get("content-security-policy") || "";
  if (cspDirectiveSources(csp, "script-src").some((source) => sourceAllowsHost(source, "www.googletagmanager.com"))) {
    pass("CSP allows Google Tag Manager");
  }
  else warn("CSP response does not expose googletagmanager.com; verify the deployed build");
}

if (robots) {
  const text = await robots.text();
  if (text.includes("Sitemap:") && text.includes("/sitemap.xml")) pass("robots.txt points to sitemap.xml");
  else fail("robots.txt does not point to sitemap.xml");
}

if (sitemap) {
  const text = await sitemap.text();
  const homeOrigins = new Set(["https://agendfined.com.br", new URL(baseUrl).origin]);
  if (sitemapLocs(text).some((url) => homeOrigins.has(url.origin) && (url.pathname === "/" || url.pathname === ""))) {
    pass("sitemap.xml contains the canonical home URL");
  }
  else fail("sitemap.xml does not contain the canonical home URL");
}

if (warnings.length) console.log(`\nWarnings: ${warnings.length}`);
if (failures.length) {
  console.error(`Failures: ${failures.length}`);
  process.exitCode = 1;
} else {
  console.log("\nLaunch check completed without failures.");
}

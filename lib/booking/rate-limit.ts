import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import ipaddr from "ipaddr.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database-types";

export type ServerClient = SupabaseClient<Database>;

// Protection against reservation flooding (§15/§16). The limiter is keyed on
// IP + business and on a business-wide aggregate, so it never relies only on an
// attacker-controlled phone number. It is hosted in Postgres (durable, shared
// across serverless instances, no new infra) behind a service_role-only RPC.
//
// Every attempt spends the per-IP counter. The business-wide counters count only
// what was written (reservas created, entradas na lista de espera), each kind on
// its own: refused attempts (horário ocupado, fora da janela) from a crowd at
// the opening of a new agenda, or from a few IPs on purpose, must not lock every
// other cliente out of the negócio (#188).
//
// perIpPublicWrite caps one IP across every negócio and both kinds, so the
// per-negócio budget does not grow with the number of negócios picked; it stays
// well above what a cliente (or a few on one CGNAT address) books in 15 min.
// perRecipientEmail caps the e-mails a public write sends to one address in a
// day; past it the write still happens and only the e-mail is skipped, so
// nobody can lock a cliente out of booking by spending their address.
export const RATE_LIMIT = {
  perIpPublicWrite: { limit: 20, windowSeconds: 60 * 15 },
  perIpPerBusiness: { limit: 8, windowSeconds: 60 * 15 },
  perBusiness: { limit: 60, windowSeconds: 60 * 15 },
  perBusinessWaitlist: { limit: 60, windowSeconds: 60 * 15 },
  perRecipientEmail: { limit: 10, windowSeconds: 60 * 60 * 24 },
} as const;

export type PublicWriteKind = "booking" | "waitlist";

// Public consultation (§16) is an anonymous, unguessable-code lookup. Keep it
// separate from the reservation counters so a flood of lookups can't starve a
// real customer's ability to book.
export const CONSULT_RATE_LIMIT = {
  perIp: { limit: 12, windowSeconds: 60 * 15 },
} as const;

// Opening the confirmation screen (right after booking, reloads, the e-mail
// link on several devices, mobile CGNAT) must not compete with the consult
// form and cancellation for the same counter. The code space (ADR 0004) keeps
// a larger per-IP budget far from a practical enumeration oracle.
export const CONFIRMATION_RATE_LIMIT = {
  perIp: { limit: 60, windowSeconds: 60 * 15 },
} as const;

// Public read/search actions are cheaper than a booking, but still execute
// privileged database work. Keep their counters separate from booking writes so
// one kind of traffic cannot starve another.
export const PUBLIC_READ_RATE_LIMIT = {
  availabilityPerIp: { limit: 120, windowSeconds: 60 * 15 },
  availabilityPerIpBusiness: { limit: 60, windowSeconds: 60 * 15 },
  serviceSearchPerIp: { limit: 30, windowSeconds: 60 * 15 },
  serviceSearchPerBusiness: { limit: 120, windowSeconds: 60 * 15 },
  customerSearchPerIpBusiness: { limit: 60, windowSeconds: 60 * 15 },
} as const;

// perIpEmail is the tight limit on one e-mail from one IP, so attempts from
// someone else's connection never lock the dono out; perEmail, on the e-mail
// alone, stays wider and only caps attempts spread across many IPs.
export const AUTH_RATE_LIMIT = {
  login: { perIp: 12, perIpEmail: 6, perEmail: 30, windowSeconds: 15 * 60 },
  signup: { perIp: 5, perIpEmail: 3, perEmail: 3, windowSeconds: 60 * 60 },
  passwordReset: { perIp: 5, perIpEmail: 3, perEmail: 10, windowSeconds: 60 * 60 },
  confirmationResend: { perIp: 5, perIpEmail: 3, perEmail: 3, windowSeconds: 60 * 60 },
  mfaVerify: { perUser: 10, windowSeconds: 15 * 60 },
} as const;

export const API_RATE_LIMIT = {
  webhook: { limit: 120, windowSeconds: 15 * 60 },
  billingReturn: { limit: 30, windowSeconds: 15 * 60 },
  reconciliation: { limit: 30, windowSeconds: 15 * 60 },
} as const;

// Each checkout an owner starts (upgrade or retry) creates a Mercado Pago
// preapproval with the AgendFined credential. Counted per negócio (one owner
// per negócio), shared by both actions.
export const BILLING_CHECKOUT_RATE_LIMIT = {
  perBusinessShort: { limit: 5, windowSeconds: 15 * 60 },
  perBusinessDaily: { limit: 20, windowSeconds: 24 * 60 * 60 },
} as const;

function isValidIp(value: string): boolean {
  return value.length <= 64 && isIP(value) !== 0;
}

// Published by Cloudflare at https://www.cloudflare.com/ips/ . Only trust
// CF-Connecting-IP when Vercel's canonical peer IP is in these ranges.
const cloudflareCidrs = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
].map((cidr) => ipaddr.parseCIDR(cidr));

function isCloudflareIp(value: string): boolean {
  if (!isValidIp(value)) return false;
  const bytes = ipaddr.process(value).toByteArray();
  return cloudflareCidrs.some(([network, bits]) => {
    const prefix = network.toByteArray();
    if (bytes.length !== prefix.length) return false;
    const whole = Math.floor(bits / 8);
    const remaining = bits % 8;
    if (bytes.some((byte, index) => index < whole && byte !== prefix[index])) return false;
    return remaining === 0 || (bytes[whole] >> (8 - remaining)) === (prefix[whole] >> (8 - remaining));
  });
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  // Only use the canonical single-hop header populated by the deployment
  // proxy. Do not trust X-Forwarded-For: a direct client can forge it and
  // otherwise bypass an IP-based limiter by choosing a new first value.
  return getClientIpFromHeaders(h);
}

export function getClientIpFromHeaders(h: Pick<Headers, "get">): string {
  const realIp = h.get("x-real-ip")?.trim();
  if (!realIp || !isValidIp(realIp)) return "unknown";
  const visitorIp = h.get("cf-connecting-ip")?.trim();
  return rateLimitSubject(isCloudflareIp(realIp) && visitorIp && isValidIp(visitorIp) ? visitorIp : realIp);
}

// One IPv6 subscriber usually holds a whole /64, so an address-level key would
// hand a single client billions of fresh counters: IPv6 is counted by its /64.
// An IPv4-mapped address is the IPv4 it carries.
function rateLimitSubject(ip: string): string {
  const address = ipaddr.process(ip);
  if (address.kind() === "ipv4") return address.toString();
  const network = new ipaddr.IPv6([...(address as ipaddr.IPv6).parts.slice(0, 4), 0, 0, 0, 0]);
  return `${network.toString()}/64`;
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function enforceAuthRateLimit(
  supabase: ServerClient,
  ip: string,
  action: "login" | "signup" | "passwordReset" | "confirmationResend",
  email: string,
): Promise<boolean> {
  return enforceWindows(supabase, buildAuthRateKeys(ip, action, email));
}

export function buildAuthRateKeys(
  ip: string,
  action: "login" | "signup" | "passwordReset" | "confirmationResend",
  email: string,
) {
  const { perIp, perIpEmail, perEmail, windowSeconds } = AUTH_RATE_LIMIT[action];
  const emailHash = hashIdentifier(email);
  return [
    { key: `auth:${action}|ip:${ip}`, limit: perIp, windowSeconds },
    { key: `auth:${action}|ip:${ip}|email:${emailHash}`, limit: perIpEmail, windowSeconds },
    { key: `auth:${action}|email:${emailHash}`, limit: perEmail, windowSeconds },
  ] as const;
}

export async function enforceMfaRateLimit(supabase: ServerClient, userId: string): Promise<boolean> {
  const config = AUTH_RATE_LIMIT.mfaVerify;
  return enforceWindows(supabase, [
    { key: `auth:mfa|user:${userId}`, limit: config.perUser, windowSeconds: config.windowSeconds },
  ]);
}

export async function enforceApiRateLimit(
  supabase: ServerClient,
  ip: string,
  route: keyof typeof API_RATE_LIMIT,
): Promise<boolean> {
  const config = API_RATE_LIMIT[route];
  return enforceWindows(supabase, [
    { key: `api:${route}|ip:${ip}`, limit: config.limit, windowSeconds: config.windowSeconds },
  ]);
}

export async function enforceBillingCheckoutRateLimit(
  supabase: ServerClient,
  businessId: string,
): Promise<boolean> {
  return enforceWindows(supabase, [
    { key: `billing:checkout|business:${businessId}|15m`, ...BILLING_CHECKOUT_RATE_LIMIT.perBusinessShort },
    { key: `billing:checkout|business:${businessId}|24h`, ...BILLING_CHECKOUT_RATE_LIMIT.perBusinessDaily },
  ]);
}

export function buildRateKeys(ip: string, businessId: string, kind: PublicWriteKind) {
  return {
    perIpGlobal: { key: `ip:${ip}|public-write`, ...RATE_LIMIT.perIpPublicWrite },
    perIp: { key: `ip:${ip}|business:${businessId}`, ...RATE_LIMIT.perIpPerBusiness },
    perBusiness: buildBusinessWriteWindow(businessId, kind),
  } as const;
}

function buildBusinessWriteWindow(businessId: string, kind: PublicWriteKind) {
  return kind === "booking"
    ? { key: `business:${businessId}`, ...RATE_LIMIT.perBusiness }
    : { key: `business:${businessId}|waitlist`, ...RATE_LIMIT.perBusinessWaitlist };
}

// Returns true when the attempt is still within limits. Spends the per-IP
// counters (global first) and only reads the business-wide one:
// recordPublicWrite spends it once the reserva or entrada is written.
export async function enforceRateLimit(
  supabase: ServerClient,
  ip: string,
  businessId: string,
  kind: PublicWriteKind,
): Promise<boolean> {
  const { perIpGlobal, perIp, perBusiness } = buildRateKeys(ip, businessId, kind);
  if (!await enforceWindows(supabase, [perIpGlobal, perIp])) return false;

  const { data, error } = await supabase.rpc("peek_booking_rate_limit", {
    p_key: perBusiness.key,
    p_limit: perBusiness.limit,
    p_window_seconds: perBusiness.windowSeconds,
  });
  if (error) throw error;
  if (data !== true) {
    // Nothing else tells the dono or the operação that the negócio stopped
    // taking reservas for the rest of the window.
    console.warn("public_write_business_rate_limited", { businessId, kind });
    return false;
  }
  return true;
}

// Counts a reserva or entrada already written against the business-wide limit.
// Never throws: the write stands even when the counter cannot be updated.
export async function recordPublicWrite(
  supabase: ServerClient,
  businessId: string,
  kind: PublicWriteKind,
): Promise<void> {
  const { key, limit, windowSeconds } = buildBusinessWriteWindow(businessId, kind);
  let reason: string | null;
  try {
    const { error } = await supabase.rpc("check_booking_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    reason = error ? error.message : null;
  } catch (error) {
    reason = error instanceof Error ? error.message : "unknown";
  }
  if (reason !== null) console.error("public_write_rate_limit_record_failed", { businessId, kind, reason });
}

// Spends one e-mail of the address's daily budget and tells whether the
// confirmação (or entrada) e-mail may go out. Never throws: when the counter
// is unavailable the e-mail is skipped and the write stands.
export async function allowPublicWriteEmail(supabase: ServerClient, email: string): Promise<boolean> {
  const key = `email:${hashIdentifier(email.trim().toLowerCase())}|public-write`;
  try {
    return await enforceWindows(supabase, [{ key, ...RATE_LIMIT.perRecipientEmail }]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : (error as { message?: string })?.message ?? "unknown";
    console.error("public_write_email_rate_limit_failed", { reason });
    return false;
  }
}

// Consultation is keyed only on the client IP (no business scope — the caller is
// anonymous and the code is what matters). Returns true when within limits.
export async function enforceConsultRateLimit(
  supabase: ServerClient,
  ip: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_booking_rate_limit", {
    p_key: `ip:${ip}|consult`,
    p_limit: CONSULT_RATE_LIMIT.perIp.limit,
    p_window_seconds: CONSULT_RATE_LIMIT.perIp.windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

export async function enforceConfirmationRateLimit(
  supabase: ServerClient,
  ip: string,
): Promise<boolean> {
  return enforceWindows(supabase, [{ key: `ip:${ip}|confirmation`, ...CONFIRMATION_RATE_LIMIT.perIp }]);
}

async function enforceWindows(
  supabase: ServerClient,
  windows: ReadonlyArray<{ key: string; limit: number; windowSeconds: number }>,
): Promise<boolean> {
  for (const { key, limit, windowSeconds } of windows) {
    const { data, error } = await supabase.rpc("check_booking_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    if (data !== true) return false;
  }
  return true;
}

export function buildAvailabilityRateKeys(ip: string, businessId: string) {
  return [
    { key: `ip:${ip}|availability`, ...PUBLIC_READ_RATE_LIMIT.availabilityPerIp },
    { key: `ip:${ip}|business:${businessId}|availability`, ...PUBLIC_READ_RATE_LIMIT.availabilityPerIpBusiness },
  ] as const;
}

export async function enforceAvailabilityRateLimit(
  supabase: ServerClient,
  ip: string,
  businessId: string,
): Promise<boolean> {
  return enforceWindows(supabase, buildAvailabilityRateKeys(ip, businessId));
}

export function buildServiceSearchRateKeys(ip: string, businessId: string) {
  return [
    { key: `ip:${ip}|service-search`, ...PUBLIC_READ_RATE_LIMIT.serviceSearchPerIp },
    { key: `business:${businessId}|service-search`, ...PUBLIC_READ_RATE_LIMIT.serviceSearchPerBusiness },
  ] as const;
}

export async function enforceServiceSearchRateLimit(
  supabase: ServerClient,
  ip: string,
  businessId: string,
): Promise<boolean> {
  return enforceWindows(supabase, buildServiceSearchRateKeys(ip, businessId));
}

export async function enforceCustomerSearchRateLimit(
  supabase: ServerClient,
  ip: string,
  businessId: string,
): Promise<boolean> {
  return enforceWindows(supabase, [
    {
      key: `ip:${ip}|business:${businessId}|customer-search`,
      ...PUBLIC_READ_RATE_LIMIT.customerSearchPerIpBusiness,
    },
  ]);
}

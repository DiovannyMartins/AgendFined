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
export const RATE_LIMIT = {
  perIpPerBusiness: { limit: 8, windowSeconds: 60 * 15 },
  perBusiness: { limit: 60, windowSeconds: 60 * 15 },
} as const;

// Public consultation (§16) is an anonymous, unguessable-code lookup. Keep it
// separate from the reservation counters so a flood of lookups can't starve a
// real customer's ability to book.
export const CONSULT_RATE_LIMIT = {
  perIp: { limit: 12, windowSeconds: 60 * 15 },
} as const;

// Public read/search actions are cheaper than a booking, but still execute
// privileged database work (and may call an external classifier). Keep their
// counters separate from booking writes so one kind of traffic cannot starve
// another.
export const PUBLIC_READ_RATE_LIMIT = {
  availabilityPerIp: { limit: 120, windowSeconds: 60 * 15 },
  availabilityPerIpBusiness: { limit: 60, windowSeconds: 60 * 15 },
  serviceSearchPerIp: { limit: 30, windowSeconds: 60 * 15 },
  serviceSearchPerBusiness: { limit: 120, windowSeconds: 60 * 15 },
  customerSearchPerIpBusiness: { limit: 60, windowSeconds: 60 * 15 },
} as const;

export const AUTH_RATE_LIMIT = {
  login: { perIp: 12, perEmail: 6, windowSeconds: 15 * 60 },
  signup: { perIp: 5, perEmail: 3, windowSeconds: 60 * 60 },
  passwordReset: { perIp: 5, perEmail: 3, windowSeconds: 60 * 60 },
  mfaVerify: { perUser: 10, windowSeconds: 15 * 60 },
} as const;

export const AI_RATE_LIMIT = {
  waitlistPriority: { limit: 20, windowSeconds: 60 * 60 },
  reportInsight: { limit: 20, windowSeconds: 60 * 60 },
} as const;

export const API_RATE_LIMIT = {
  webhook: { limit: 120, windowSeconds: 15 * 60 },
  billingReturn: { limit: 30, windowSeconds: 15 * 60 },
  reconciliation: { limit: 30, windowSeconds: 15 * 60 },
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
  return isCloudflareIp(realIp) && visitorIp && isValidIp(visitorIp) ? visitorIp : realIp;
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function enforceAuthRateLimit(
  supabase: ServerClient,
  ip: string,
  action: "login" | "signup" | "passwordReset",
  email: string,
): Promise<boolean> {
  const config = AUTH_RATE_LIMIT[action];
  return enforceWindows(supabase, [
    { key: `auth:${action}|ip:${ip}`, limit: config.perIp, windowSeconds: config.windowSeconds },
    { key: `auth:${action}|email:${hashIdentifier(email)}`, limit: config.perEmail, windowSeconds: config.windowSeconds },
  ]);
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

export async function enforceAiRateLimit(
  supabase: ServerClient,
  userId: string,
  businessId: string,
  action: keyof typeof AI_RATE_LIMIT,
): Promise<boolean> {
  const config = AI_RATE_LIMIT[action];
  return enforceWindows(supabase, [
    { key: `ai:${action}|user:${userId}`, limit: config.limit, windowSeconds: config.windowSeconds },
    { key: `ai:${action}|business:${businessId}`, limit: config.limit * 2, windowSeconds: config.windowSeconds },
  ]);
}

export function buildRateKeys(ip: string, businessId: string) {
  return [
    { key: `ip:${ip}|business:${businessId}`, ...RATE_LIMIT.perIpPerBusiness },
    { key: `business:${businessId}`, ...RATE_LIMIT.perBusiness },
  ] as const;
}

// Returns true when the attempt is still within limits for every window.
export async function enforceRateLimit(
  supabase: ServerClient,
  ip: string,
  businessId: string,
): Promise<boolean> {
  for (const { key, limit, windowSeconds } of buildRateKeys(ip, businessId)) {
    const { data, error } = await supabase.rpc("check_booking_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    if (data === false) return false;
  }
  return true;
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

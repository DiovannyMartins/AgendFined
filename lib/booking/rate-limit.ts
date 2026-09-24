import { headers } from "next/headers";
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

function isValidIp(value: string): boolean {
  if (value.length === 0 || value.length > 64 || value.includes(",")) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
  }
  return /^[0-9a-fA-F:]+$/.test(value) && value.includes(":");
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  // Only use the canonical single-hop header populated by the deployment
  // proxy. Do not trust X-Forwarded-For: a direct client can forge it and
  // otherwise bypass an IP-based limiter by choosing a new first value.
  const realIp = h.get("x-real-ip")?.trim();
  return realIp && isValidIp(realIp) ? realIp : "unknown";
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

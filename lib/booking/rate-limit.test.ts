import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRMATION_RATE_LIMIT,
  CONSULT_RATE_LIMIT,
  PUBLIC_READ_RATE_LIMIT,
  RATE_LIMIT,
  buildAvailabilityRateKeys,
  buildRateKeys,
  buildServiceSearchRateKeys,
  enforceConfirmationRateLimit,
  enforceConsultRateLimit,
  enforceApiRateLimit,
  enforceBillingCheckoutRateLimit,
  getClientIpFromHeaders,
  enforceRateLimit,
  recordPublicWrite,
} from "@/lib/booking/rate-limit";
import type { Database } from "@/lib/supabase/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeClient({ perIp, perBusiness }: { perIp: boolean; perBusiness: boolean }) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "peek_booking_rate_limit" ? perBusiness : perIp,
    error: null,
  }));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

// Same counting as the two RPCs inside one window: check_booking_rate_limit
// adds one and allows up to the limit; peek_booking_rate_limit only reads and
// allows while the count is below the limit.
function windowClient() {
  const counts = new Map<string, number>();
  const rpc = vi.fn(async (name: string, { p_key, p_limit }: { p_key: string; p_limit: number }) => {
    const count = counts.get(p_key) ?? 0;
    if (name === "peek_booking_rate_limit") return { data: count < p_limit, error: null };
    counts.set(p_key, count + 1);
    return { data: count + 1 <= p_limit, error: null };
  });
  return { client: { rpc } as unknown as SupabaseClient<Database>, counts };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildRateKeys (§16)", () => {
  it("keys on IP+business and on a business-wide aggregate, never on phone", () => {
    expect(buildRateKeys("1.2.3.4", "biz-1", "booking")).toEqual({
      perIp: { key: "ip:1.2.3.4|business:biz-1", limit: 8, windowSeconds: 900 },
      perBusiness: { key: "business:biz-1", limit: 60, windowSeconds: 900 },
    });
  });

  it("counts the lista de espera apart from the reservas", () => {
    expect(buildRateKeys("1.2.3.4", "biz-1", "waitlist")).toEqual({
      perIp: { key: "ip:1.2.3.4|business:biz-1", limit: 8, windowSeconds: 900 },
      perBusiness: { key: "business:biz-1|waitlist", limit: 60, windowSeconds: 900 },
    });
  });

  it("uses the documented default limits", () => {
    expect(RATE_LIMIT.perIpPerBusiness.limit).toBe(8);
    expect(RATE_LIMIT.perBusiness.limit).toBe(60);
    expect(RATE_LIMIT.perBusinessWaitlist.limit).toBe(60);
  });
});

describe("API throttling", () => {
  it("ignores client-supplied forwarded chains and accepts only a canonical IP", () => {
    const forged = new Headers({ "x-forwarded-for": "203.0.113.1" });
    expect(getClientIpFromHeaders(forged)).toBe("unknown");
    expect(getClientIpFromHeaders(new Headers({ "x-real-ip": "192.0.2.5" }))).toBe("192.0.2.5");
  });

  it("uses Cloudflare's visitor IP only when the Vercel peer belongs to Cloudflare", () => {
    expect(getClientIpFromHeaders(new Headers({
      "x-real-ip": "104.16.42.1",
      "cf-connecting-ip": "203.0.113.42",
    }))).toBe("203.0.113.42");
    expect(getClientIpFromHeaders(new Headers({
      "x-real-ip": "2606:4700::1234",
      "cf-connecting-ip": "2001:db8::1",
    }))).toBe("2001:db8::/64");
    expect(getClientIpFromHeaders(new Headers({
      "x-real-ip": "198.51.100.5",
      "cf-connecting-ip": "203.0.113.42",
    }))).toBe("198.51.100.5");
    expect(getClientIpFromHeaders(new Headers({
      "x-real-ip": "104.16.42.1",
      "cf-connecting-ip": "bad,203.0.113.42",
    }))).toBe("104.16.42.1");
  });

  // One IPv6 subscriber usually holds a whole /64: counting per address would
  // hand them billions of fresh counters.
  it("counts an IPv6 client by its /64 and an IPv4-mapped one by its IPv4", () => {
    const ip = (value: string) => getClientIpFromHeaders(new Headers({ "x-real-ip": value }));

    expect(ip("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(ip("2001:db8:1:2:ffff:ffff:ffff:fffe")).toBe("2001:db8:1:2::/64");
    expect(ip("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(ip("::ffff:192.0.2.5")).toBe("192.0.2.5");
  });

  it("uses a dedicated per-route counter and denies an exhausted window", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await expect(enforceApiRateLimit(client, "192.0.2.5", "webhook")).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith("check_booking_rate_limit", {
      p_key: "api:webhook|ip:192.0.2.5",
      p_limit: 120,
      p_window_seconds: 900,
    });
  });
});

describe("public read rate-limit keys", () => {
  it("keeps availability limits separate and scoped by IP/business", () => {
    expect(buildAvailabilityRateKeys("1.2.3.4", "biz-1")).toEqual([
      { key: "ip:1.2.3.4|availability", ...PUBLIC_READ_RATE_LIMIT.availabilityPerIp },
      { key: "ip:1.2.3.4|business:biz-1|availability", ...PUBLIC_READ_RATE_LIMIT.availabilityPerIpBusiness },
    ]);
  });

  it("keeps service search limits separate from booking limits", () => {
    expect(buildServiceSearchRateKeys("1.2.3.4", "biz-1")).toEqual([
      { key: "ip:1.2.3.4|service-search", ...PUBLIC_READ_RATE_LIMIT.serviceSearchPerIp },
      { key: "business:biz-1|service-search", ...PUBLIC_READ_RATE_LIMIT.serviceSearchPerBusiness },
    ]);
  });
});

describe("enforceRateLimit", () => {
  it("spends the per-IP window and only reads the business aggregate", async () => {
    const { client, rpc } = fakeClient({ perIp: true, perBusiness: true });

    await expect(enforceRateLimit(client, "1.2.3.4", "biz-1", "booking")).resolves.toBe(true);

    expect(rpc.mock.calls).toEqual([
      ["check_booking_rate_limit", { p_key: "ip:1.2.3.4|business:biz-1", p_limit: 8, p_window_seconds: 900 }],
      ["peek_booking_rate_limit", { p_key: "business:biz-1", p_limit: 60, p_window_seconds: 900 }],
    ]);
  });

  it("blocks when the per-IP window is exceeded, without reading the business aggregate", async () => {
    const { client, rpc } = fakeClient({ perIp: false, perBusiness: true });

    await expect(enforceRateLimit(client, "1.2.3.4", "biz-1", "booking")).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("blocks and logs the negócio when the business aggregate is exhausted", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({ perIp: true, perBusiness: false });

    await expect(enforceRateLimit(client, "1.2.3.4", "biz-1", "waitlist")).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith("public_write_business_rate_limited", { businessId: "biz-1", kind: "waitlist" });
  });

  it("propagates an RPC error", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: new Error("boom") })) } as unknown as SupabaseClient<Database>;
    await expect(enforceRateLimit(client, "1.2.3.4", "biz-1", "booking")).rejects.toThrow("boom");
  });

  // #188, cenário 1: the negócio opens a new agenda and a crowd hits horários
  // already taken. None of those attempts writes anything.
  it("keeps taking reservas after a crowd of refused attempts", async () => {
    const { client } = windowClient();

    for (let attempt = 0; attempt < 200; attempt++) {
      await expect(enforceRateLimit(client, `198.51.100.${attempt % 40}`, "biz-1", "booking")).resolves.toBe(true);
    }

    await expect(enforceRateLimit(client, "203.0.113.9", "biz-1", "booking")).resolves.toBe(true);
  });

  it("stops the negócio once the limit of reservas written is reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = windowClient();

    for (let booking = 0; booking < RATE_LIMIT.perBusiness.limit; booking++) {
      await expect(enforceRateLimit(client, `198.51.100.${booking}`, "biz-1", "booking")).resolves.toBe(true);
      await recordPublicWrite(client, "biz-1", "booking");
    }

    await expect(enforceRateLimit(client, "203.0.113.9", "biz-1", "booking")).resolves.toBe(false);
    // The lista de espera has its own counter, and so does every other negócio.
    await expect(enforceRateLimit(client, "203.0.113.9", "biz-1", "waitlist")).resolves.toBe(true);
    await expect(enforceRateLimit(client, "203.0.113.9", "biz-2", "booking")).resolves.toBe(true);
  });
});

describe("recordPublicWrite", () => {
  it("spends the business aggregate of the kind written", async () => {
    const { client, rpc } = fakeClient({ perIp: true, perBusiness: true });

    await recordPublicWrite(client, "biz-1", "waitlist");

    expect(rpc).toHaveBeenCalledWith("check_booking_rate_limit", {
      p_key: "business:biz-1|waitlist",
      p_limit: 60,
      p_window_seconds: 900,
    });
  });

  it.each([
    ["returns an error", async () => ({ data: null, error: { message: "boom" } })],
    ["throws", async () => { throw new Error("boom"); }],
  ])("logs instead of failing the write when the RPC %s", async (_case, rpc) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { rpc: vi.fn(rpc) } as unknown as SupabaseClient<Database>;

    await expect(recordPublicWrite(client, "biz-1", "booking")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("public_write_rate_limit_record_failed", {
      businessId: "biz-1",
      kind: "booking",
      reason: "boom",
    });
  });
});

describe("enforceBillingCheckoutRateLimit", () => {
  it("counts the negócio's checkouts in a 15-minute and a daily window", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(enforceBillingCheckoutRateLimit(client, "biz-1")).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith("check_booking_rate_limit", {
      p_key: "billing:checkout|business:biz-1|15m",
      p_limit: 5,
      p_window_seconds: 900,
    });
    expect(rpc).toHaveBeenCalledWith("check_booking_rate_limit", {
      p_key: "billing:checkout|business:biz-1|24h",
      p_limit: 20,
      p_window_seconds: 86_400,
    });
  });

  it("blocks once the daily window is exhausted", async () => {
    const rpc = vi.fn(async (_name: string, { p_key }: { p_key: string }) => ({ data: !p_key.endsWith("|24h"), error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(enforceBillingCheckoutRateLimit(client, "biz-1")).resolves.toBe(false);
  });
});

describe("enforceConsultRateLimit (§16 lookup)", () => {
  it("keys only on the client IP, separate from reservation counters", async () => {
    const rpc = vi.fn(async (_name: string, { p_key, p_limit }: { p_key: string; p_limit: number }) => {
      expect(p_key).toBe("ip:1.2.3.4|consult");
      expect(p_limit).toBe(CONSULT_RATE_LIMIT.perIp.limit);
      return { data: true, error: null };
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await expect(enforceConsultRateLimit(client, "1.2.3.4")).resolves.toBe(true);
  });

  it("blocks once the per-IP window is exceeded", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await expect(enforceConsultRateLimit(client, "1.2.3.4")).resolves.toBe(false);
  });

  it("propagates an RPC error", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: new Error("boom") })) } as unknown as SupabaseClient<Database>;
    await expect(enforceConsultRateLimit(client, "1.2.3.4")).rejects.toThrow("boom");
  });
});

// #140: abrir a confirmação não pode esgotar o contador da consulta e do cancelamento.
describe("enforceConfirmationRateLimit", () => {
  it("uses its own per-IP counter with a larger budget than consultation", async () => {
    const rpc = vi.fn(async (_name: string, { p_key, p_limit }: { p_key: string; p_limit: number }) => {
      expect(p_key).toBe("ip:1.2.3.4|confirmation");
      expect(p_limit).toBe(CONFIRMATION_RATE_LIMIT.perIp.limit);
      return { data: true, error: null };
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(enforceConfirmationRateLimit(client, "1.2.3.4")).resolves.toBe(true);
    expect(CONFIRMATION_RATE_LIMIT.perIp.limit).toBeGreaterThan(CONSULT_RATE_LIMIT.perIp.limit);
  });

  it("propagates an RPC error so the caller can fail closed", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: new Error("boom") })) } as unknown as SupabaseClient<Database>;
    await expect(enforceConfirmationRateLimit(client, "1.2.3.4")).rejects.toThrow("boom");
  });
});

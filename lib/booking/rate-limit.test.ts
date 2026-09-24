import { describe, expect, it, vi } from "vitest";
import {
  CONSULT_RATE_LIMIT,
  PUBLIC_READ_RATE_LIMIT,
  RATE_LIMIT,
  buildAvailabilityRateKeys,
  buildRateKeys,
  buildServiceSearchRateKeys,
  enforceConsultRateLimit,
  enforceRateLimit,
} from "@/lib/booking/rate-limit";
import type { Database } from "@/lib/supabase/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeClient(perWindow: boolean[]) {
  let i = 0;
  const rpc = vi.fn(async (_name: string, { p_key }: { p_key: string }) => {
    // Business aggregate window is the second in buildRateKeys.
    const idx = p_key.startsWith("business:") ? 1 : 0;
    const allowed = perWindow[Math.min(i++, idx)];
    return { data: allowed, error: null };
  });
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("buildRateKeys (§16)", () => {
  it("keys on IP+business and on a business-wide aggregate, never on phone", () => {
    const keys = buildRateKeys("1.2.3.4", "biz-1");
    expect(keys).toEqual([
      { key: "ip:1.2.3.4|business:biz-1", limit: 8, windowSeconds: 900 },
      { key: "business:biz-1", limit: 60, windowSeconds: 900 },
    ]);
  });

  it("uses the documented default limits", () => {
    expect(RATE_LIMIT.perIpPerBusiness.limit).toBe(8);
    expect(RATE_LIMIT.perBusiness.limit).toBe(60);
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
  it("allows when both windows are within limits", async () => {
    const allowed = await enforceRateLimit(fakeClient([true, true]), "1.2.3.4", "biz-1");
    expect(allowed).toBe(true);
  });

  it("blocks when the per-IP window is exceeded", async () => {
    const allowed = await enforceRateLimit(fakeClient([false, true]), "1.2.3.4", "biz-1");
    expect(allowed).toBe(false);
  });

  it("blocks when the business aggregate window is exceeded", async () => {
    const allowed = await enforceRateLimit(fakeClient([true, false]), "1.2.3.4", "biz-1");
    expect(allowed).toBe(false);
  });

  it("propagates an RPC error", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: new Error("boom") })) } as unknown as SupabaseClient<Database>;
    await expect(enforceRateLimit(client, "1.2.3.4", "biz-1")).rejects.toThrow("boom");
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

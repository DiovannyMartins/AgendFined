import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_RATE_LIMIT,
  CONFIRMATION_RATE_LIMIT,
  CONSULT_RATE_LIMIT,
  PUBLIC_READ_RATE_LIMIT,
  RATE_LIMIT,
  buildAuthRateKeys,
  buildAvailabilityRateKeys,
  buildRateKeys,
  buildServiceSearchRateKeys,
  enforceConfirmationRateLimit,
  enforceConsultRateLimit,
  enforceApiRateLimit,
  enforceAvailabilityRateLimit,
  enforceAvailabilityIpRateLimit,
  enforceAvailabilityBusinessRateLimit,
  enforceBillingCheckoutRateLimit,
  enforceOwnerEmailRateLimit,
  OWNER_EMAIL_RATE_LIMIT,
  getClientIpFromHeaders,
  enforceRateLimit,
  recordPublicWrite,
  allowPublicWriteEmail,
  allowPublicCapabilityEmail,
  enforcePublicRescheduleLimit,
  PUBLIC_CAPABILITY_RATE_LIMIT,
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
  it("keys on the IP, on IP+business and on a business-wide aggregate, never on phone", () => {
    expect(buildRateKeys("1.2.3.4", "biz-1", "booking")).toEqual({
      perIpGlobal: { key: "ip:1.2.3.4|public-write", limit: 20, windowSeconds: 900 },
      perIp: { key: "ip:1.2.3.4|business:biz-1", limit: 8, windowSeconds: 900 },
      perBusiness: { key: "business:biz-1", limit: 60, windowSeconds: 900 },
    });
  });

  it("counts the lista de espera apart from the reservas", () => {
    expect(buildRateKeys("1.2.3.4", "biz-1", "waitlist")).toEqual({
      perIpGlobal: { key: "ip:1.2.3.4|public-write", limit: 20, windowSeconds: 900 },
      perIp: { key: "ip:1.2.3.4|business:biz-1", limit: 8, windowSeconds: 900 },
      perBusiness: { key: "business:biz-1|waitlist", limit: 60, windowSeconds: 900 },
    });
  });

  it("uses the documented default limits", () => {
    expect(RATE_LIMIT.perIpPublicWrite.limit).toBe(20);
    expect(RATE_LIMIT.perIpPerBusiness.limit).toBe(8);
    expect(RATE_LIMIT.perBusiness.limit).toBe(60);
    expect(RATE_LIMIT.perBusinessWaitlist.limit).toBe(60);
    expect(RATE_LIMIT.perRecipientEmail).toEqual({ limit: 10, windowSeconds: 86_400 });
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

// The tight per-e-mail limit is per IP too: someone else's wrong passwords
// must not lock the dono out from their own connection. A wider limit on the
// e-mail alone still caps guesses spread across many IPs.
// #216: the two availability windows go in one round-trip, same keys and limits.
describe("enforceAvailabilityRateLimit", () => {
  it("spends both windows, in order, in a single RPC", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    expect(await enforceAvailabilityRateLimit(client, "1.2.3.4", "biz-1")).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("check_booking_rate_limits", {
      p_windows: buildAvailabilityRateKeys("1.2.3.4", "biz-1").map(({ key, limit, windowSeconds }) => ({
        key,
        limit,
        window_seconds: windowSeconds,
      })),
    });
  });

  it("refuses when a window is over its limit and throws when the counter fails", async () => {
    const over = { rpc: vi.fn(async () => ({ data: false, error: null })) } as unknown as SupabaseClient<Database>;
    expect(await enforceAvailabilityRateLimit(over, "1.2.3.4", "biz-1")).toBe(false);

    const failing = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })),
    } as unknown as SupabaseClient<Database>;
    await expect(enforceAvailabilityRateLimit(failing, "1.2.3.4", "biz-1")).rejects.toEqual({ message: "boom" });
  });
});

// #219: the reschedule page charges the same two windows apart, the per-IP one
// before its service-role lookup; together they count what the combined call does.
describe("enforceAvailabilityIpRateLimit / enforceAvailabilityBusinessRateLimit", () => {
  it("spends each availability window on its own, with the combined call's keys and limits", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;
    const [perIp, perIpBusiness] = buildAvailabilityRateKeys("1.2.3.4", "biz-1");

    expect(await enforceAvailabilityIpRateLimit(client, "1.2.3.4")).toBe(true);
    expect(await enforceAvailabilityBusinessRateLimit(client, "1.2.3.4", "biz-1")).toBe(true);
    expect(rpc.mock.calls).toEqual([
      ["check_booking_rate_limit", { p_key: perIp.key, p_limit: perIp.limit, p_window_seconds: perIp.windowSeconds }],
      [
        "check_booking_rate_limit",
        { p_key: perIpBusiness.key, p_limit: perIpBusiness.limit, p_window_seconds: perIpBusiness.windowSeconds },
      ],
    ]);
  });

  it("refuses over the limit and throws when the counter fails", async () => {
    const over = { rpc: vi.fn(async () => ({ data: false, error: null })) } as unknown as SupabaseClient<Database>;
    expect(await enforceAvailabilityIpRateLimit(over, "1.2.3.4")).toBe(false);
    expect(await enforceAvailabilityBusinessRateLimit(over, "1.2.3.4", "biz-1")).toBe(false);

    const failing = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })),
    } as unknown as SupabaseClient<Database>;
    await expect(enforceAvailabilityIpRateLimit(failing, "1.2.3.4")).rejects.toEqual({ message: "boom" });
  });
});

describe("auth rate-limit keys", () => {
  it.each(["login", "passwordReset"] as const)("limits %s per IP + e-mail and, more loosely, per e-mail", (action) => {
    const keys = buildAuthRateKeys("1.2.3.4", action, "dono@example.com");
    const config = AUTH_RATE_LIMIT[action];

    expect(keys.map(({ limit }) => limit)).toEqual([config.perIp, config.perIpEmail, config.perEmail]);
    expect(config.perEmail).toBeGreaterThan(config.perIpEmail);
    expect(keys[1].key).toContain("ip:1.2.3.4");
    expect(keys[2].key).not.toContain("1.2.3.4");
  });

  it("gives each IP its own e-mail counter", () => {
    const [, fromA] = buildAuthRateKeys("1.2.3.4", "login", "dono@example.com");
    const [, fromB] = buildAuthRateKeys("5.6.7.8", "login", "dono@example.com");

    expect(fromA.key).not.toBe(fromB.key);
  });

  it("keeps the e-mail out of the keys", () => {
    for (const { key } of buildAuthRateKeys("1.2.3.4", "login", "dono@example.com")) {
      expect(key).not.toContain("dono");
    }
  });
});

describe("enforceRateLimit", () => {
  it("spends the per-IP windows, the global one first, and only reads the business aggregate", async () => {
    const { client, rpc } = fakeClient({ perIp: true, perBusiness: true });

    await expect(enforceRateLimit(client, "1.2.3.4", "biz-1", "booking")).resolves.toBe(true);

    expect(rpc.mock.calls).toEqual([
      ["check_booking_rate_limit", { p_key: "ip:1.2.3.4|public-write", p_limit: 20, p_window_seconds: 900 }],
      ["check_booking_rate_limit", { p_key: "ip:1.2.3.4|business:biz-1", p_limit: 8, p_window_seconds: 900 }],
      ["peek_booking_rate_limit", { p_key: "business:biz-1", p_limit: 60, p_window_seconds: 900 }],
    ]);
  });

  it("blocks when the per-IP window is exceeded, without reading the business aggregate", async () => {
    const { client, rpc } = fakeClient({ perIp: false, perBusiness: true });

    await expect(enforceRateLimit(client, "1.2.3.4", "biz-1", "booking")).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  // The per-business budget alone grows with every negócio an IP picks.
  it("caps one IP across negócios, whatever their number", async () => {
    const { client } = windowClient();
    const results: boolean[] = [];

    for (let business = 1; business <= 5; business++) {
      for (let attempt = 0; attempt < RATE_LIMIT.perIpPerBusiness.limit; attempt++) {
        results.push(await enforceRateLimit(client, "1.2.3.4", `biz-${business}`, "booking"));
      }
    }

    expect(results.filter(Boolean)).toHaveLength(RATE_LIMIT.perIpPublicWrite.limit);
    expect(results.slice(RATE_LIMIT.perIpPublicWrite.limit).every((allowed) => !allowed)).toBe(true);
    // The lista de espera shares the same IP budget; another IP keeps its own.
    await expect(enforceRateLimit(client, "1.2.3.4", "biz-6", "waitlist")).resolves.toBe(false);
    await expect(enforceRateLimit(client, "5.6.7.8", "biz-1", "booking")).resolves.toBe(true);
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

describe("allowPublicWriteEmail", () => {
  it("allows up to the limit per address, then suppresses the next e-mail", async () => {
    const { client } = windowClient();

    for (let sent = 0; sent < RATE_LIMIT.perRecipientEmail.limit; sent++) {
      await expect(allowPublicWriteEmail(client, "maria@example.com")).resolves.toBe(true);
    }

    await expect(allowPublicWriteEmail(client, "maria@example.com")).resolves.toBe(false);
    await expect(allowPublicWriteEmail(client, "outra@example.com")).resolves.toBe(true);
  });

  it("counts an address the same whatever its case, and keeps it out of the key", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await allowPublicWriteEmail(client, "Maria@Example.com");
    await allowPublicWriteEmail(client, "maria@example.com");

    const [first, second] = rpc.mock.calls.map((call) => (call as unknown[])[1] as { p_key: string });
    expect(first.p_key).toBe(second.p_key);
    expect(first.p_key).toMatch(/^email:[0-9a-f]{32}\|public-write$/);
    expect(rpc).toHaveBeenCalledWith("check_booking_rate_limit", expect.objectContaining({
      p_limit: 10,
      p_window_seconds: 86_400,
    }));
  });

  it.each([
    ["returns an error", async () => ({ data: null, error: { message: "boom" } })],
    ["throws", async () => { throw new Error("boom"); }],
  ])("skips the e-mail and logs when the RPC %s", async (_case, rpc) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { rpc: vi.fn(rpc) } as unknown as SupabaseClient<Database>;

    await expect(allowPublicWriteEmail(client, "maria@example.com")).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith("public_write_email_rate_limit_failed", { reason: "boom" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("maria");
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

describe("enforceOwnerEmailRateLimit", () => {
  const sender = (ownerId: string, recipientEmail: string) => ({ businessId: "biz-1", ownerId, recipientEmail });

  it("counts the e-mails of the dono's actions per conta and per cliente address", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(
      enforceOwnerEmailRateLimit(client, sender("owner-1", " Cliente@Example.com "), "booking_confirmation"),
    ).resolves.toBe(true);

    const keys = rpc.mock.calls.map((call) => (call as unknown as [string, { p_key: string; p_limit: number }])[1]);
    expect(keys).toEqual([
      { p_key: "owner:owner-1|owner_email|1h", p_limit: OWNER_EMAIL_RATE_LIMIT.perOwnerHourly.limit, p_window_seconds: 3_600 },
      { p_key: "owner:owner-1|owner_email|24h", p_limit: OWNER_EMAIL_RATE_LIMIT.perOwnerDaily.limit, p_window_seconds: 86_400 },
      {
        p_key: expect.stringMatching(/^email:[0-9a-f]{32}\|owner_email$/),
        p_limit: OWNER_EMAIL_RATE_LIMIT.perRecipientDaily.limit,
        p_window_seconds: 86_400,
      },
    ]);
    expect(JSON.stringify(keys)).not.toContain("cliente");
  });

  // The negócio can be deleted and created again under a new id; the conta
  // stays, so the budget does too.
  it("keeps the budget when the dono recreates the negócio", async () => {
    const { client } = windowClient();
    const { limit } = OWNER_EMAIL_RATE_LIMIT.perOwnerHourly;
    for (let sent = 0; sent < limit; sent += 1) {
      await expect(
        enforceOwnerEmailRateLimit(client, { businessId: "biz-1", ownerId: "owner-1", recipientEmail: `c${sent}@example.com` }, "reschedule"),
      ).resolves.toBe(true);
    }

    await expect(
      enforceOwnerEmailRateLimit(client, { businessId: "biz-2", ownerId: "owner-1", recipientEmail: "novo@example.com" }, "reschedule"),
    ).resolves.toBe(false);
    await expect(
      enforceOwnerEmailRateLimit(client, { businessId: "biz-3", ownerId: "owner-2", recipientEmail: "novo@example.com" }, "reschedule"),
    ).resolves.toBe(true);
  });

  it("caps the e-mails one address gets in a day, whatever the case", async () => {
    const { client } = windowClient();
    const { limit } = OWNER_EMAIL_RATE_LIMIT.perRecipientDaily;
    for (let sent = 0; sent < limit; sent += 1) {
      await expect(
        enforceOwnerEmailRateLimit(client, sender("owner-1", "vitima@example.com"), sent % 2 ? "cancellation" : "reschedule"),
      ).resolves.toBe(true);
    }

    await expect(enforceOwnerEmailRateLimit(client, sender("owner-1", "VITIMA@example.com"), "waitlist_slot_freed")).resolves.toBe(false);
    await expect(enforceOwnerEmailRateLimit(client, sender("owner-1", "outra@example.com"), "waitlist_slot_freed")).resolves.toBe(true);
  });

  it("throws when the counter cannot be updated", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(enforceOwnerEmailRateLimit(client, sender("owner-1", "c@example.com"), "booking_confirmation")).rejects.toBeTruthy();
  });
});

describe("enforcePublicRescheduleLimit", () => {
  it("allows the reserva's daily remarcações and refuses the next one, per reserva", async () => {
    const { client, counts } = windowClient();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { limit } = PUBLIC_CAPABILITY_RATE_LIMIT.reschedulesPerBooking;

    for (let move = 0; move < limit; move += 1) {
      await expect(enforcePublicRescheduleLimit(client, "booking-1")).resolves.toBe(true);
    }

    await expect(enforcePublicRescheduleLimit(client, "booking-1")).resolves.toBe(false);
    await expect(enforcePublicRescheduleLimit(client, "booking-2")).resolves.toBe(true);
    expect(counts.get("booking:booking-1|public-reschedule")).toBe(limit + 1);
  });

  it("throws when the counter cannot be updated", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(enforcePublicRescheduleLimit(client, "booking-1")).rejects.toBeTruthy();
  });
});

describe("allowPublicCapabilityEmail", () => {
  it("shares one hourly budget of the negócio across kinds and recipients, then skips the next e-mail", async () => {
    const { client } = windowClient();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { limit } = PUBLIC_CAPABILITY_RATE_LIMIT.emailPerBusinessHourly;

    for (let sent = 0; sent < limit; sent += 1) {
      await expect(
        allowPublicCapabilityEmail(client, "biz-1", sent % 2 ? "cancellation" : "reschedule"),
      ).resolves.toBe(true);
    }

    await expect(allowPublicCapabilityEmail(client, "biz-1", "reschedule")).resolves.toBe(false);
    await expect(allowPublicCapabilityEmail(client, "biz-2", "reschedule")).resolves.toBe(true);
  });

  it("also spends the cliente's address cap when given a recipient", async () => {
    const { client, counts } = windowClient();

    await expect(allowPublicCapabilityEmail(client, "biz-1", "reschedule", "maria@example.com")).resolves.toBe(true);

    const recipientKey = [...counts.keys()].find((key) => key.endsWith("|public-write"));
    expect(recipientKey).toMatch(/^email:[0-9a-f]{32}\|public-write$/);
    counts.set(recipientKey!, RATE_LIMIT.perRecipientEmail.limit);
    await expect(allowPublicCapabilityEmail(client, "biz-1", "reschedule", "maria@example.com")).resolves.toBe(false);
    await expect(allowPublicCapabilityEmail(client, "biz-1", "reschedule")).resolves.toBe(true);
  });

  it("skips the e-mail and logs when the counter fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(allowPublicCapabilityEmail(client, "biz-1", "cancellation", "maria@example.com")).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith("public_capability_email_rate_limit_failed", {
      businessId: "biz-1",
      kind: "cancellation",
      reason: "boom",
    });
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

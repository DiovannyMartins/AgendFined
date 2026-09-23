import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "@/lib/booking/anti-bot";

const options = { expectedAction: "booking_write" as const, remoteIp: "203.0.113.7" };

function configureVerifier() {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
  vi.stubEnv("APP_URL", "https://agenda.example/app");
}

describe("verifyTurnstile", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("allows an unconfigured non-production environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    expect((await verifyTurnstile(undefined, options)).ok).toBe(true);
  });

  it("fails closed when production configuration is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await verifyTurnstile(undefined, options)).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts only a token bound to the expected action and hostname", async () => {
    configureVerifier();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: "booking_write", hostname: "agenda.example" })),
    );

    expect((await verifyTurnstile("valid-token", options)).ok).toBe(true);
    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = (request[1] as RequestInit).body as URLSearchParams;
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it.each([
    [{ success: false, action: "booking_write", hostname: "agenda.example" }, "provider rejection"],
    [{ success: true, action: "booking_consult", hostname: "agenda.example" }, "wrong action"],
    [{ success: true, action: "booking_write", hostname: "attacker.example" }, "wrong hostname"],
  ])("rejects %s", async (providerResult) => {
    configureVerifier();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(providerResult)));
    expect((await verifyTurnstile("token", options)).ok).toBe(false);
  });

  it("fails closed for missing tokens, network failures, invalid JSON, and non-2xx responses", async () => {
    configureVerifier();
    expect((await verifyTurnstile(undefined, options)).ok).toBe(false);

    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    expect((await verifyTurnstile("token", options)).ok).toBe(false);

    vi.mocked(fetch).mockResolvedValueOnce(new Response("not-json"));
    expect((await verifyTurnstile("token", options)).ok).toBe(false);

    vi.mocked(fetch).mockResolvedValueOnce(new Response("error", { status: 500 }));
    expect((await verifyTurnstile("token", options)).ok).toBe(false);
  });
});

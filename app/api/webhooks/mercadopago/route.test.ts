// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  enforceApiRateLimit: async () => true,
  getClientIpFromHeaders: () => "127.0.0.1",
}));
vi.mock("@/lib/billing/webhook-server", () => ({ runMercadoPagoWebhook: vi.fn() }));

import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("Mercado Pago webhook route", () => {
  // #219: no cache in front of the receiver may keep or replay an answer.
  it.each([
    ["the secret is not configured", undefined, 503],
    ["the signature is invalid", "webhook-secret", 401],
  ])("answers no-store when %s", async (_label, secret, status) => {
    if (secret) vi.stubEnv("MERCADO_PAGO_WEBHOOK_SECRET", secret);
    else vi.stubEnv("MERCADO_PAGO_WEBHOOK_SECRET", "");

    const response = await POST(new NextRequest("https://agenda.example/api/webhooks/mercadopago?data.id=123", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": "ts=1,v1=00", "x-request-id": "req-1" },
      body: JSON.stringify({ type: "subscription_preapproval", data: { id: "123" } }),
    }));

    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

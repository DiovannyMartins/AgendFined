import { afterEach, describe, expect, it, vi } from "vitest";
import { createMercadoPagoProvider } from "./mercado-pago";

type FetchMock = (url: string, init: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(impl: FetchMock) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createMercadoPagoProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a preapproval for the R$1/mês plan and returns init_point", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ id: "mp_123", init_point: "https://mp.example/checkout" }));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-123" });
    const result = await provider.createPreapproval({
      plan: "pro",
      externalReference: "biz_1",
      backUrl: "https://app.example/dashboard/configuracoes",
      payerEmail: "owner@example.com",
      notificationUrl: "https://tunnel.example/api/webhooks/mercadopago",
    });

    expect(result).toEqual({ preapprovalId: "mp_123", initPoint: "https://mp.example/checkout" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TEST-123");
    const body = JSON.parse(String(init.body));
    expect(body.auto_recurring).toEqual({
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 1,
      currency_id: "BRL",
    });
    expect(body.external_reference).toBe("biz_1");
    expect(body.payer_email).toBe("owner@example.com");
    expect(body.back_url).toBe("https://app.example/dashboard/configuracoes");
    expect(body.notification_url).toBe("https://tunnel.example/api/webhooks/mercadopago");
  });

  it("omits notification_url when not provided", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ id: "mp_1", init_point: "https://mp.example/x" }));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await provider.createPreapproval({
      plan: "pro",
      externalReference: "biz_1",
      backUrl: "https://app.example",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("notification_url");
  });

  it("omits payer_email when not provided", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ id: "mp_1", init_point: "https://mp.example/x" }));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await provider.createPreapproval({
      plan: "pro",
      externalReference: "biz_1",
      backUrl: "https://app.example",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("payer_email");
  });

  it("rejects the free plan (no subscription is sold for it)", async () => {
    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await expect(
      provider.createPreapproval({
        plan: "free",
        externalReference: "biz_1",
        backUrl: "https://app.example",
      }),
    ).rejects.toThrow("does not sell a subscription for the free plan");
  });

  it("throws when Mercado Pago returns a non-ok status", async () => {
    stubFetch(async () => jsonResponse({ message: "invalid_token" }, 401));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await expect(
      provider.createPreapproval({
        plan: "pro",
        externalReference: "biz_1",
        backUrl: "https://app.example",
      }),
    ).rejects.toThrow("Mercado Pago preapproval failed (401): invalid_token");
  });

  it("throws when the response is missing id or init_point", async () => {
    stubFetch(async () => jsonResponse({ id: "mp_1" }));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await expect(
      provider.createPreapproval({
        plan: "pro",
        externalReference: "biz_1",
        backUrl: "https://app.example",
      }),
    ).rejects.toThrow("missing id/init_point");
  });

  it("fetches a preapproval and maps its status and external_reference", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({
        id: "mp_1",
        status: "authorized",
        external_reference: "biz_1",
        auto_recurring: { start_date: "2026-09-01T00:00:00.000Z", end_date: "2026-10-01T00:00:00.000Z" },
      }),
    );

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    const result = await provider.getPreapproval("mp_1");

    expect(result).toEqual({
      id: "mp_1",
      status: "authorized",
      externalReference: "biz_1",
      currentPeriodStart: "2026-09-01T00:00:00.000Z",
      currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval/mp_1");
    expect(init.method).toBe("GET");
  });

  it("throws when fetching a preapproval returns a non-ok status", async () => {
    stubFetch(async () => jsonResponse({ message: "not_found" }, 404));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await expect(provider.getPreapproval("mp_1")).rejects.toThrow(
      "Mercado Pago preapproval fetch failed (404): not_found",
    );
  });

  it("throws when the preapproval status is missing or unknown", async () => {
    stubFetch(async () => jsonResponse({ id: "mp_1", status: "weird" }));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await expect(provider.getPreapproval("mp_1")).rejects.toThrow("missing a valid status");
  });

  it("cancels a preapproval via PUT with status cancelled", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await provider.cancelPreapproval("mp_1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval/mp_1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ status: "cancelled" });
  });

  it("throws when cancelling a preapproval returns a non-ok status", async () => {
    stubFetch(async () => jsonResponse({ message: "not_found" }, 404));

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await expect(provider.cancelPreapproval("mp_1")).rejects.toThrow(
      "Mercado Pago preapproval cancel failed (404): not_found",
    );
  });

  it("treats an already-cancelled preapproval as a successful cancel", async () => {
    const fetchMock = stubFetch(async (url, init) => {
      if (init.method === "PUT") {
        return jsonResponse({ message: "You can not modify a cancelled preapproval" }, 400);
      }
      return jsonResponse({ id: "mp_1", status: "cancelled", external_reference: null });
    });

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await expect(provider.cancelPreapproval("mp_1")).resolves.toBeUndefined();

    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe("https://api.mercadopago.com/preapproval/mp_1");
    expect(firstInit.method).toBe("PUT");

    const [secondUrl, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toBe("https://api.mercadopago.com/preapproval/mp_1");
    expect(secondInit.method).toBe("GET");
  });

  it("still throws when the PUT fails and the preapproval is not cancelled", async () => {
    stubFetch(async (url, init) => {
      if (init.method === "PUT") {
        return jsonResponse({ message: "bad_request" }, 400);
      }
      return jsonResponse({ id: "mp_1", status: "authorized", external_reference: null });
    });

    const provider = createMercadoPagoProvider({ accessToken: "TEST-1" });
    await expect(provider.cancelPreapproval("mp_1")).rejects.toThrow(
      "Mercado Pago preapproval cancel failed (400): bad_request",
    );
  });
});

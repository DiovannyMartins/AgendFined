import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email/resend";

const email = {
  to: "ana@example.com",
  subject: "Sua reserva foi confirmada",
  text: "texto",
  html: "<p>html</p>",
};

function timeoutError(): DOMException {
  return new DOMException("The operation was aborted due to timeout", "TimeoutError");
}

// Runs sendEmail while letting the short waits between attempts elapse.
async function send() {
  const result = sendEmail(email);
  await vi.runAllTimersAsync();
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "AgendFined <reservas@example.com>");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("does not call the provider when it is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(send()).resolves.toEqual({ sent: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTP 503", () => Promise.resolve(new Response("{}", { status: 503 }))],
    ["HTTP 500", () => Promise.resolve(new Response("{}", { status: 500 }))],
    ["HTTP 429", () => Promise.resolve(new Response("{}", { status: 429 }))],
    ["a timeout", () => Promise.reject(timeoutError())],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("tries again after %s and reports the later success", async (_label, failure) => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(failure)
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(send()).resolves.toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after two extra attempts", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(send()).resolves.toEqual({ sent: false, reason: "provider_error" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 422])("does not repeat a request the provider refused with HTTP %i", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(send()).resolves.toEqual({ sent: false, reason: "provider_error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops trying once the time budget of the action is spent", async () => {
    // Each attempt hangs until its own timeout fires.
    const fetchMock = vi.fn().mockImplementation(() => {
      vi.setSystemTime(Date.now() + 5_000);
      return Promise.reject(timeoutError());
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(send()).resolves.toEqual({ sent: false, reason: "provider_error" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends every attempt with the same idempotency key so a retry never duplicates the e-mail", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await send();

    const keys = fetchMock.mock.calls.map(([, init]) => new Headers(init.headers).get("Idempotency-Key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });
});

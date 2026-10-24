import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { enforceConfirmationRateLimit } = vi.hoisted(() => ({
  enforceConfirmationRateLimit: vi.fn<(supabase: unknown, ip: string) => Promise<boolean>>(async () => true),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/booking/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/booking/rate-limit")>()),
  enforceConfirmationRateLimit,
}));

const { checkConfirmationOpening, confirmationRefusalResponse } = await import("@/lib/booking/confirmation-gate");

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://agendfined.test"), {
    method: init.method ?? "GET",
    headers: { "x-real-ip": "203.0.113.7", ...init.headers },
  });
}

// #179: a confirmação limitada responde 429 (ou 503 com o limitador fora do
// ar) já no HTML do servidor, em vez de um 500 cuja mensagem só aparecia
// depois da hidratação.
describe("checkConfirmationOpening", () => {
  beforeEach(() => {
    enforceConfirmationRateLimit.mockReset();
    enforceConfirmationRateLimit.mockResolvedValue(true);
  });

  it("lets an opening within the limit through, counted once per IP", async () => {
    await expect(checkConfirmationOpening(request("/barbearia/confirmacao?code=65925DBB"))).resolves.toBeNull();

    expect(enforceConfirmationRateLimit).toHaveBeenCalledOnce();
    expect(enforceConfirmationRateLimit).toHaveBeenCalledWith(expect.anything(), "203.0.113.7");
  });

  it("refuses an opening over the limit", async () => {
    enforceConfirmationRateLimit.mockResolvedValue(false);

    await expect(checkConfirmationOpening(request("/barbearia/confirmacao?code=65925DBB"))).resolves.toBe("rate_limited");
  });

  it("fails closed when the limiter is unavailable", async () => {
    enforceConfirmationRateLimit.mockRejectedValue(new Error("limiter down"));

    await expect(checkConfirmationOpening(request("/barbearia/confirmacao?code=65925DBB"))).resolves.toBe("unavailable");
  });

  it.each([
    ["a malformed code, answered 404 by the page", "/barbearia/confirmacao?code=123", {}],
    ["a missing code", "/barbearia/confirmacao", {}],
    ["another page", "/barbearia/consultar?code=65925DBB", {}],
    ["the cancellation Server Action", "/barbearia/confirmacao?code=65925DBB", { method: "POST", headers: { "next-action": "abc" } }],
  ])("does not spend the limiter on %s", async (_case, path, init) => {
    await expect(checkConfirmationOpening(request(path, init))).resolves.toBeNull();

    expect(enforceConfirmationRateLimit).not.toHaveBeenCalled();
  });
});

describe("confirmationRefusalResponse", () => {
  it("answers 429 with the message already in the server HTML", async () => {
    const response = confirmationRefusalResponse("rate_limited", "bm9uY2U=", Date.UTC(2026, 9, 23, 12, 5));

    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    // Fixed 15-minute windows: 12:05 waits until 12:15.
    expect(response.headers.get("retry-after")).toBe("600");
    const html = await response.text();
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain("<h1>Muitas consultas seguidas</h1>");
    expect(html).toContain("Aguarde alguns minutos e recarregue. Sua reserva não foi afetada.");
    expect(html).toContain('<script nonce="bm9uY2U=">');
    expect(html).not.toMatch(/404|não existe/);
  });

  it("answers 503 when the limiter is unavailable", async () => {
    const response = confirmationRefusalResponse("unavailable", "bm9uY2U=");

    expect(response.status).toBe(503);
    const html = await response.text();
    expect(html).toContain("Não foi possível carregar sua reserva agora");
    expect(html).toContain("Sua reserva não foi afetada.");
  });
});

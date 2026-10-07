import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClientIp: vi.fn(),
  enforceInterestRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  sendInterestSubmissionEmails: vi.fn(),
  auditSecurityEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  getClientIp: mocks.getClientIp,
  enforceInterestRateLimit: mocks.enforceInterestRateLimit,
}));
vi.mock("@/lib/booking/anti-bot", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("@/lib/email/interest", () => ({ sendInterestSubmissionEmails: mocks.sendInterestSubmissionEmails }));
vi.mock("@/lib/security/audit", () => ({ auditSecurityEvent: mocks.auditSecurityEvent }));

import { submitInterest } from "@/lib/marketing/actions";

const initial = { ok: true as const, data: undefined };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("submitInterest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientIp.mockResolvedValue("203.0.113.7");
    mocks.enforceInterestRateLimit.mockResolvedValue(true);
    mocks.verifyTurnstile.mockResolvedValue({ ok: true });
    mocks.sendInterestSubmissionEmails.mockResolvedValue({ sent: true });
  });

  it("requires a valid e-mail and explicit consent", async () => {
    expect(await submitInterest(initial, form({ email: "visitante@example.com" }))).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await submitInterest(initial, form({ email: "invalido", consent: "on" }))).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.sendInterestSubmissionEmails).not.toHaveBeenCalled();
  });

  it("silently accepts the honeypot without sending e-mail", async () => {
    const result = await submitInterest(initial, form({ email: "bot@example.com", consent: "on", website: "x" }));
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.enforceInterestRateLimit).not.toHaveBeenCalled();
    expect(mocks.sendInterestSubmissionEmails).not.toHaveBeenCalled();
  });

  it("sends normalized e-mail and audits success without storing the address", async () => {
    const result = await submitInterest(initial, form({ email: "  Visitante@Example.com ", consent: "on", cfTurnstileToken: "t" }));
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.sendInterestSubmissionEmails).toHaveBeenCalledWith("visitante@example.com");
    expect(mocks.auditSecurityEvent).toHaveBeenCalledWith("marketing.interest_signup");
    expect(JSON.stringify(mocks.auditSecurityEvent.mock.calls)).not.toContain("visitante");
  });

  it("rejects when rate limited, when the limiter is unavailable, or when anti-bot fails", async () => {
    const valid = () => form({ email: "visitante@example.com", consent: "on" });
    mocks.enforceInterestRateLimit.mockResolvedValueOnce(false);
    expect(await submitInterest(initial, valid())).toMatchObject({ ok: false, code: "RATE_LIMITED" });

    mocks.enforceInterestRateLimit.mockRejectedValueOnce(new Error("db down"));
    expect(await submitInterest(initial, valid())).toMatchObject({ ok: false, code: "RATE_LIMIT_UNAVAILABLE" });

    mocks.verifyTurnstile.mockResolvedValueOnce({ ok: false });
    expect(await submitInterest(initial, valid())).toMatchObject({ ok: false, code: "ANTI_BOT" });
    expect(mocks.sendInterestSubmissionEmails).not.toHaveBeenCalled();
  });

  it("reports provider unavailability instead of claiming success", async () => {
    mocks.sendInterestSubmissionEmails.mockResolvedValueOnce({ sent: false, reason: "provider_error" });
    const result = await submitInterest(initial, form({ email: "visitante@example.com", consent: "on" }));
    expect(result).toMatchObject({ ok: false, code: "EMAIL_PROVIDER_ERROR" });
    expect(mocks.auditSecurityEvent).not.toHaveBeenCalled();
  });
});

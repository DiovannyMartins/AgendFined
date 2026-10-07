import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendInterestSubmissionEmails } from "@/lib/email/interest";

function sentBodies() {
  return vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe("sendInterestSubmissionEmails", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports not_configured without calling the provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    expect(await sendInterestSubmissionEmails("visitante@example.com")).toEqual({ sent: false, reason: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("notifies support and confirms to the visitor with real line breaks and escaped HTML", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "reservas@example.com");
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));

    const email = "a<b>@example.com";
    expect(await sendInterestSubmissionEmails(email)).toEqual({ sent: true });

    const [support, visitor] = sentBodies();
    expect(support.to).toEqual(["agendfined@outlook.com"]);
    expect(support.reply_to).toBe(email);
    expect(support.html).toContain("a&lt;b&gt;@example.com");
    expect(support.html).not.toContain("<b>");
    expect(visitor.to).toEqual([email]);
    for (const message of [support, visitor]) {
      expect(message.text).toContain("\n");
      expect(message.text).not.toContain("\\n");
    }
  });

  it.each([
    ["non-2xx response", () => vi.mocked(fetch).mockResolvedValue(new Response("err", { status: 500 }))],
    ["network failure", () => vi.mocked(fetch).mockRejectedValue(new Error("down"))],
  ])("reports provider_error on %s", async (_label, arrange) => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "reservas@example.com");
    arrange();
    expect(await sendInterestSubmissionEmails("visitante@example.com")).toEqual({ sent: false, reason: "provider_error" });
  });
});

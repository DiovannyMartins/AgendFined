import { describe, expect, it, vi } from "vitest";
import { sendPlanCutoverNotices, type PlanCutoverNoticeClaim } from "@/lib/billing/plan-cutover-notices";

function row(id: string, overrides: Partial<PlanCutoverNoticeClaim> = {}): PlanCutoverNoticeClaim {
  return {
    send_id: id,
    claim_token: `token-${id}`,
    business_id: `business-${id}`,
    business_name: "Barbearia",
    business_timezone: "America/Manaus",
    trial_ends_at: "2026-12-02T00:00:00+00:00",
    owner_email: "dono@example.com",
    ...overrides,
  };
}

describe("sendPlanCutoverNotices", () => {
  it("não reserva nada enquanto o e-mail não está configurado", async () => {
    const claim = vi.fn();

    const result = await sendPlanCutoverNotices({ emailConfigured: false, claim, send: vi.fn(), mark: vi.fn() });

    expect(claim).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0 });
  });

  it("marca só os e-mails que saíram e segue o lote depois de uma falha", async () => {
    const claim = vi.fn().mockResolvedValue([row("a"), row("b"), row("c")]);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ sent: false, reason: "provider_error" })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ sent: true });
    const mark = vi.fn().mockResolvedValue(true);

    const result = await sendPlanCutoverNotices({ emailConfigured: true, claim, send, mark });

    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith("c", "token-c");
    expect(result).toEqual({ claimed: 3, sent: 1, failed: 2 });
  });

  it("não envia para um negócio cujo dono não tem e-mail", async () => {
    const send = vi.fn();

    const result = await sendPlanCutoverNotices({
      emailConfigured: true,
      claim: vi.fn().mockResolvedValue([row("a", { owner_email: null })]),
      send,
      mark: vi.fn(),
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it("passa ao envio o fim do teste, o fuso e o id do envio como chave de idempotência", async () => {
    const send = vi.fn().mockResolvedValue({ sent: true });

    await sendPlanCutoverNotices({ emailConfigured: true, claim: vi.fn().mockResolvedValue([row("a")]), send, mark: vi.fn().mockResolvedValue(true) });

    expect(send).toHaveBeenCalledWith({
      ownerEmail: "dono@example.com",
      businessName: "Barbearia",
      trialEndsAt: "2026-12-02T00:00:00+00:00",
      timezone: "America/Manaus",
      idempotencyKey: "plan-cutover-a",
    });
  });

  it("um envio que saiu mas não foi marcado conta como falha e volta com a mesma chave", async () => {
    const send = vi.fn().mockResolvedValue({ sent: true });
    const claim = vi.fn().mockResolvedValue([row("a")]);

    const first = await sendPlanCutoverNotices({ emailConfigured: true, claim, send, mark: vi.fn().mockResolvedValue(false) });
    await sendPlanCutoverNotices({ emailConfigured: true, claim, send, mark: vi.fn().mockResolvedValue(true) });

    expect(first).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(send.mock.calls.map(([email]) => email.idempotencyKey)).toEqual(["plan-cutover-a", "plan-cutover-a"]);
  });

  it("para de enviar quando o prazo do run acaba", async () => {
    const send = vi.fn().mockResolvedValue({ sent: true });
    let calls = 0;

    const result = await sendPlanCutoverNotices({
      emailConfigured: true,
      claim: vi.fn().mockResolvedValue([row("a"), row("b")]),
      send,
      mark: vi.fn().mockResolvedValue(true),
      outOfTime: () => calls++ > 0,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
  });
});

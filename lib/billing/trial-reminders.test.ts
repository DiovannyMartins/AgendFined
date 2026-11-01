import { describe, expect, it, vi } from "vitest";
import { sendTrialReminders, type TrialReminderClaim } from "@/lib/billing/trial-reminders";

function row(id: string, overrides: Partial<TrialReminderClaim> = {}): TrialReminderClaim {
  return {
    send_id: id,
    claim_token: `token-${id}`,
    kind: "trial_ends_in_3_days",
    days_left: 3,
    business_id: `business-${id}`,
    business_name: "Barbearia",
    business_timezone: "America/Manaus",
    trial_ends_at: "2027-03-10T15:00:00+00:00",
    owner_email: "dono@example.com",
    ...overrides,
  };
}

describe("sendTrialReminders", () => {
  it("não reserva nada enquanto o e-mail não está configurado", async () => {
    const claim = vi.fn();

    const result = await sendTrialReminders({ emailConfigured: false, claim, send: vi.fn(), mark: vi.fn() });

    expect(claim).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0 });
  });

  it("marca só os avisos que saíram e segue o lote depois de uma falha", async () => {
    const claim = vi.fn().mockResolvedValue([row("a"), row("b"), row("c")]);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ sent: false, reason: "provider_error" })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ sent: true });
    const mark = vi.fn().mockResolvedValue(true);

    const result = await sendTrialReminders({ emailConfigured: true, claim, send, mark });

    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith("c", "token-c");
    expect(result).toEqual({ claimed: 3, sent: 1, failed: 2 });
  });

  it("não envia para um negócio cujo dono não tem e-mail", async () => {
    const send = vi.fn();

    const result = await sendTrialReminders({
      emailConfigured: true,
      claim: vi.fn().mockResolvedValue([row("a", { owner_email: null })]),
      send,
      mark: vi.fn(),
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it("passa ao envio o tipo, os dias, o fuso e o id do envio como chave de idempotência", async () => {
    const send = vi.fn().mockResolvedValue({ sent: true });

    await sendTrialReminders({
      emailConfigured: true,
      claim: vi.fn().mockResolvedValue([row("a", { kind: "trial_ended", days_left: 0 })]),
      send,
      mark: vi.fn().mockResolvedValue(true),
    });

    expect(send).toHaveBeenCalledWith({
      ownerEmail: "dono@example.com",
      businessName: "Barbearia",
      kind: "trial_ended",
      daysLeft: 0,
      trialEndsAt: "2027-03-10T15:00:00+00:00",
      timezone: "America/Manaus",
      idempotencyKey: "trial-reminder-a",
    });
  });

  it("conta como falha um envio que saiu mas não pôde ser marcado", async () => {
    const result = await sendTrialReminders({
      emailConfigured: true,
      claim: vi.fn().mockResolvedValue([row("a")]),
      send: vi.fn().mockResolvedValue({ sent: true }),
      mark: vi.fn().mockRejectedValue(new Error("db")),
    });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
  });

  it("para quando o tempo do run acaba e deixa o resto para o próximo", async () => {
    const send = vi.fn().mockResolvedValue({ sent: true });
    const outOfTime = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);

    const result = await sendTrialReminders({
      emailConfigured: true,
      claim: vi.fn().mockResolvedValue([row("a"), row("b")]),
      send,
      mark: vi.fn().mockResolvedValue(true),
      outOfTime,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
  });
});

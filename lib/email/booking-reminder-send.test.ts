import { describe, expect, it, vi } from "vitest";
import { sendDueReminders } from "../../supabase/functions/booking-reminders/send";

const now = new Date("2026-10-20T12:00:00Z");

function candidate(id: string, business_timezone: string) {
  return {
    id,
    business_name: "Barbearia",
    business_timezone,
    business_slug: "barbearia",
    customer_name_snapshot: "Ana",
    customer_email_snapshot: "ana@example.com",
    service_name_snapshot: "Corte",
    start_at: "2026-10-20T15:00:00Z",
    public_code: "22APMB04",
  };
}

describe("sendDueReminders", () => {
  it("skips a candidate whose fuso cannot be formatted and still sends the rest of the lote", async () => {
    const deliver = vi.fn().mockResolvedValue(true);

    const sentIds = await sendDueReminders(
      [candidate("poisoned", "FOO+3"), candidate("healthy", "America/Manaus")],
      { now, appUrl: "https://agendfined.com.br", deliver },
    );

    expect(sentIds).toEqual(["healthy"]);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].text).toContain("horário de Manaus");
  });

  it("keeps sending after a delivery that throws or is refused", async () => {
    const deliver = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const sentIds = await sendDueReminders(
      [candidate("a", "America/Sao_Paulo"), candidate("b", "America/Sao_Paulo"), candidate("c", "America/Sao_Paulo")],
      { now, appUrl: "https://agendfined.com.br", deliver },
    );

    expect(sentIds).toEqual(["c"]);
  });

  it("does not send to a reserva without e-mail or outside the 24h window", async () => {
    const deliver = vi.fn().mockResolvedValue(true);

    const sentIds = await sendDueReminders(
      [
        { ...candidate("no-email", "America/Sao_Paulo"), customer_email_snapshot: null },
        { ...candidate("past", "America/Sao_Paulo"), start_at: "2026-10-20T11:00:00Z" },
        { ...candidate("far", "America/Sao_Paulo"), start_at: "2026-10-22T12:00:00Z" },
      ],
      { now, appUrl: "https://agendfined.com.br", deliver },
    );

    expect(sentIds).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });
});

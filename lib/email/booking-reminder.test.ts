import { describe, expect, it } from "vitest";
import { buildReminderEmail } from "../../supabase/functions/booking-reminders/email";

describe("buildReminderEmail", () => {
  it("builds the reminder with the branded HTML template and text fallback", () => {
    const email = buildReminderEmail({
      business_name: "Barbearia <Demo>",
      customer_name_snapshot: "Ana & João",
      customer_email_snapshot: "ana@example.com",
      service_name_snapshot: "Corte \"premium\"",
      start_at: "2026-05-10T20:00:00Z",
      public_code: "ABC-123",
    });

    expect(email.to).toBe("ana@example.com");
    expect(email.subject).toContain("Lembrete");
    expect(email.text).toContain("Corte \"premium\"");
    expect(email.text).toContain("Código da reserva: ABC-123");
    expect(email.html).toContain("LEMBRETE DE RESERVA");
    expect(email.html).toContain("background-color:#141414");
    expect(email.html).toContain("background-color:#1c1c1c");
    expect(email.html).toContain("Ana &amp; João");
    expect(email.html).toContain("Barbearia &lt;Demo&gt;");
    expect(email.html).toContain("Corte &quot;premium&quot;");
    expect(email.html).toContain("ABC-123");
  });

  it("says which fuso the time is in, like the other e-mails", () => {
    const email = buildReminderEmail({
      business_name: "Barbearia",
      customer_name_snapshot: "Ana",
      customer_email_snapshot: "ana@example.com",
      service_name_snapshot: "Corte",
      start_at: "2026-10-20T14:00:00Z",
      public_code: "ABC-123",
      business_timezone: "America/Manaus",
    });

    expect(email.text).toContain("Data e horário: 20/10/2026 às 10:00 (horário de Manaus, UTC−4)");
    expect(email.html).toContain("20/10/2026 às 10:00 (horário de Manaus, UTC−4)");
  });
});

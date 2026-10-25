import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_LOGO_HTML, EMAIL_LOGO_URL } from "@/lib/email/brand-logo";
import { buildReminderEmail } from "../../supabase/functions/booking-reminders/email";

const TEMPLATES_DIR = join(process.cwd(), "supabase", "templates");

describe("logo dos e-mails", () => {
  it("aponta para o PNG publicado em public/brand", () => {
    const path = new URL(EMAIL_LOGO_URL).pathname;
    expect(path).toBe("/brand/email-logo.png");
    expect(existsSync(join(process.cwd(), "public", path))).toBe(true);
  });

  it("mantém o nome legível quando o cliente de e-mail bloqueia imagens", () => {
    expect(EMAIL_LOGO_HTML).toContain('alt="AgendFined"');
  });

  // Os templates do Supabase e a Edge Function não importam lib/; repetem a tag.
  it.each(readdirSync(TEMPLATES_DIR))("o template de autenticação %s usa a mesma logo", (file) => {
    const template = readFileSync(join(TEMPLATES_DIR, file), "utf8");
    expect(template).toContain(EMAIL_LOGO_HTML);
    expect(template).not.toContain(">A</td>");
  });

  it("o lembrete da Edge Function usa a mesma logo", () => {
    const email = buildReminderEmail({
      business_name: "Barbearia Demo",
      customer_name_snapshot: "Ana",
      customer_email_snapshot: "ana@example.com",
      service_name_snapshot: "Corte",
      start_at: "2026-05-10T20:00:00Z",
      public_code: "ABC-123",
    });

    expect(email.html).toContain(EMAIL_LOGO_HTML);
  });
});

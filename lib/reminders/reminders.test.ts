import { describe, expect, it } from "vitest";
import { formatWhen } from "@/lib/format/when";
import {
  REMINDER_LEAD_MINUTES,
  buildReminderEmail,
  isReminderDue,
  prepareReminderEmails,
  type ReminderCandidateRow,
} from "@/lib/reminders/reminders";

// Worked example (source of truth for the lead/24h rule and the email text).
const NOW = new Date("2026-05-10T12:00:00Z");

function row(overrides: Partial<ReminderCandidateRow>): ReminderCandidateRow {
  return {
    id: "bk1",
    business_id: "biz1",
    business_name: "Barbearia Demo",
    business_slug: "barbearia-demo",
    customer_name_snapshot: "Ana",
    customer_email_snapshot: "ana@example.com",
    service_name_snapshot: "Corte",
    start_at: "2026-05-10T20:00:00Z",
    public_code: "65925dbb-ab9d-42eb-832a-030c1b28d1e4",
    ...overrides,
  };
}

describe("isReminderDue (lead = 24h, strictly future)", () => {
  it("is true for a booking inside the 24h window", () => {
    // 8h ahead.
    expect(isReminderDue("2026-05-10T20:00:00Z", NOW)).toBe(true);
  });

  it("is true at exactly the 24h boundary (<= lead)", () => {
    expect(isReminderDue("2026-05-11T12:00:00Z", NOW)).toBe(true);
  });

  it("is false beyond the 24h window", () => {
    expect(isReminderDue("2026-05-11T13:00:00Z", NOW)).toBe(false);
  });

  it("is false in the past (strictly future required)", () => {
    expect(isReminderDue("2026-05-10T11:00:00Z", NOW)).toBe(false);
  });
});

describe("REMINDER_LEAD_MINUTES", () => {
  it("is 24 hours", () => {
    expect(REMINDER_LEAD_MINUTES).toBe(24 * 60);
  });
});

describe("prepareReminderEmails", () => {
  it("emits an email for every due candidate that has an email address", () => {
    const rows = [
      row({}),
      row({ id: "bk2", start_at: "2026-05-11T13:00:00Z", customer_email_snapshot: "b@x.com" }), // beyond lead -> skip
      row({ id: "bk3", customer_email_snapshot: null }), // no email -> skip
      row({ id: "bk4", start_at: "2026-05-10T11:00:00Z" }), // past -> skip
    ];
    const emails = prepareReminderEmails(rows, NOW);
    expect(emails.map((e) => e.bookingId)).toEqual(["bk1"]);
    expect(emails[0]).toMatchObject({
      bookingId: "bk1",
      to: "ana@example.com",
    });
  });

  it("records the booking id so the caller can mark it sent afterwards", () => {
    const [email] = prepareReminderEmails([row({})], NOW);
    expect(email.bookingId).toBe("bk1");
  });

  it("returns an empty array when nothing is due", () => {
    expect(prepareReminderEmails([], NOW)).toEqual([]);
  });
});

describe("formatWhen (datas renderizadas no fuso do negócio)", () => {
  it("renders the appointment in the app timezone (UTC-3 -> 15:00)", () => {
    expect(formatWhen("2026-05-10T18:00:00Z")).toBe("10/05/2026 às 15:00");
  });
});

describe("buildReminderEmail", () => {
  it("produces a plain-text reminder with the service, business and customer", () => {
    const email = buildReminderEmail(row({}));
    expect(email.to).toBe("ana@example.com");
    expect(email.subject).toContain("Lembrete");
    expect(email.text).toContain("Ana");
    expect(email.text).toContain("Barbearia Demo");
    expect(email.text).toContain("Corte");
    // Default row start is 20:00Z = 17:00 in Sao_Paulo.
    expect(email.text).toContain("10/05/2026 às 17:00");
  });
});

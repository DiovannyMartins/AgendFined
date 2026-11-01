import { describe, expect, it } from "vitest";
import { parseTrialEndsAt, trialBannerMessage, trialDaysLeft } from "@/lib/plan/trial";

const NOW = new Date("2026-10-31T12:00:00.000Z");

describe("parseTrialEndsAt (ADR 0013)", () => {
  it("parses the timestamp PostgREST sends", () => {
    expect(parseTrialEndsAt("2026-11-30T12:00:00+00:00")?.toISOString()).toBe("2026-11-30T12:00:00.000Z");
  });

  it("treats infinity, null and garbage as no teste, never an Invalid Date", () => {
    expect(parseTrialEndsAt("infinity")).toBeNull();
    expect(parseTrialEndsAt("-infinity")).toBeNull();
    expect(parseTrialEndsAt(null)).toBeNull();
    expect(parseTrialEndsAt(undefined)).toBeNull();
    expect(parseTrialEndsAt("amanhã")).toBeNull();
  });
});

describe("trialDaysLeft", () => {
  it("counts whole days rounded up", () => {
    expect(trialDaysLeft("2026-11-30T12:00:00+00:00", NOW)).toBe(30);
    expect(trialDaysLeft("2026-11-03T12:00:00+00:00", NOW)).toBe(3);
    expect(trialDaysLeft("2026-10-31T13:00:00+00:00", NOW)).toBe(1);
  });

  it("is null once the teste ended, exactly at trial_ends_at", () => {
    expect(trialDaysLeft("2026-10-31T12:00:00+00:00", NOW)).toBeNull();
    expect(trialDaysLeft("2026-10-30T12:00:00+00:00", NOW)).toBeNull();
  });

  it("is null for infinity and for no teste", () => {
    expect(trialDaysLeft("infinity", NOW)).toBeNull();
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });
});

describe("trialBannerMessage", () => {
  it("speaks of the days left in pt-BR", () => {
    expect(trialBannerMessage(12)).toBe("Faltam 12 dias do seu teste grátis");
    expect(trialBannerMessage(1)).toBe("Falta 1 dia do seu teste grátis");
  });
});

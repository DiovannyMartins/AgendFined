import { describe, expect, it } from "vitest";
import {
  computeAvailableSlots,
  generateSlotStartTimes,
  isWithinWindow,
  lastBookableDate,
  isValidSlot,
  localDayRangeUtc,
  localTimeExists,
  overlaps,
  zonedTimeToUtc,
  zonedTimeToUtcMs,
} from "@/lib/booking/availability";
import type { BusinessRules } from "@/lib/booking/availability";

describe("overlaps", () => {
  it("detects overlapping half-open intervals", () => {
    expect(overlaps({ start: "09:00", end: "09:45" }, { start: "08:30", end: "09:15" })).toBe(true);
  });

  it("allows back-to-back appointments", () => {
    expect(overlaps({ start: "09:00", end: "10:00" }, { start: "10:00", end: "11:00" })).toBe(false);
  });

  it("compares the DB's HH:MM:SS with the form's HH:MM by time, not by string (#125)", () => {
    expect(overlaps({ start: "08:00:00", end: "12:00:00" }, { start: "12:00", end: "14:00" })).toBe(false);
    expect(overlaps({ start: "14:00:00", end: "18:00:00" }, { start: "12:00", end: "14:00" })).toBe(false);
    expect(overlaps({ start: "08:00:00", end: "12:00:00" }, { start: "11:00", end: "15:00" })).toBe(true);
  });
});

describe("generateSlotStartTimes (spec §10.4 example)", () => {
  it("produces candidates capped by service duration within the interval", () => {
    const starts = generateSlotStartTimes(
      { startTime: "08:00", endTime: "12:00" },
      30,
      45,
    );
    expect(starts).toEqual(["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("never produces a candidate that ends past the interval end", () => {
    const starts = generateSlotStartTimes({ startTime: "09:00", endTime: "10:00" }, 30, 45);
    expect(starts).toEqual(["09:00"]);
  });
});

describe("isWithinWindow", () => {
  const rules: BusinessRules = {
    slotIntervalMinutes: 30,
    minNoticeMinutes: 120,
    bookingWindowDays: 60,
  };

  it("accepts a date inside the window", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    expect(isWithinWindow("2026-09-10", rules, now)).toBe(true);
  });

  it("rejects a date too far in the future", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    expect(isWithinWindow("2026-12-01", rules, now)).toBe(false);
  });

  it("rejects a past date", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    expect(isWithinWindow("2026-08-01", rules, now)).toBe(false);
  });
});

describe("lastBookableDate", () => {
  it("is the business-local today plus the janela", () => {
    // 01:00 UTC is still the previous day in São Paulo.
    expect(lastBookableDate(new Date("2026-10-19T01:00:00Z"), "America/Sao_Paulo", 60)).toBe("2026-12-17");
    expect(lastBookableDate(new Date("2026-10-18T12:00:00Z"), "America/Sao_Paulo", 0)).toBe("2026-10-18");
  });

  it("is the last date isWithinWindow accepts", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    const rules: BusinessRules = { slotIntervalMinutes: 30, minNoticeMinutes: 0, bookingWindowDays: 90 };
    const last = lastBookableDate(now, undefined, 90);
    expect(isWithinWindow(last, rules, now)).toBe(true);
    expect(isWithinWindow("2026-12-01", rules, now)).toBe(false);
    expect(last).toBe("2026-11-30");
  });
});

describe("computeAvailableSlots", () => {
  const rules: BusinessRules = {
    slotIntervalMinutes: 30,
    minNoticeMinutes: 0,
    bookingWindowDays: 60,
  };

  const now = new Date("2026-09-10T00:00:00Z");
  const utc = (time: string, d = "2026-09-10") => zonedTimeToUtcMs(d, time);
  const r = (start: number, end: number) => ({ startMs: start, endMs: end });

  it("excludes a slot overlapping an existing booking", () => {
    const slots = computeAvailableSlots({
      intervals: [{ startTime: "08:00", endTime: "12:00" }],
      rules,
      durationMinutes: 45,
      date: "2026-09-10",
      now,
      blocks: [],
      occupancies: [r(utc("09:00"), utc("09:45"))],
    });
    expect(slots).toContain("08:00");
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00");
  });

  it("excludes slots within a block", () => {
    const slots = computeAvailableSlots({
      intervals: [{ startTime: "08:00", endTime: "12:00" }],
      rules,
      durationMinutes: 30,
      date: "2026-09-10",
      now,
      blocks: [r(utc("10:00"), utc("11:00"))],
      occupancies: [],
    });
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:30");
    expect(slots).toContain("08:00");
  });

  it("excludes slots against a block that crosses midnight", () => {
    // Block 20:00 local (09-09) -> 06:00 local (09-10): must block the 09-10 00:00-06:00
    // window while leaving 06:00+ free.
    const slots = computeAvailableSlots({
      intervals: [{ startTime: "00:00", endTime: "10:00" }],
      rules,
      durationMinutes: 30,
      date: "2026-09-10",
      now,
      blocks: [r(utc("20:00", "2026-09-09"), utc("06:00"))],
      occupancies: [],
    });
    expect(slots).not.toContain("00:00");
    expect(slots).not.toContain("03:30");
    expect(slots).not.toContain("05:30");
    expect(slots).toContain("06:00");
    expect(slots).toContain("08:00");
  });

  it("treats faixas encostadas as one continuous faixa (#147)", () => {
    const slots = computeAvailableSlots({
      intervals: [
        { startTime: "09:00:00", endTime: "12:00:00" },
        { startTime: "12:00", endTime: "17:00" },
      ],
      rules,
      durationMinutes: 45,
      date: "2026-09-10",
      now,
      blocks: [],
      occupancies: [],
    });
    expect(slots).toContain("11:00");
    expect(slots).toContain("11:30");
    expect(slots).toContain("16:00");
    expect(slots).not.toContain("16:30");
    expect(slots).toEqual([...new Set(slots)]);
  });

  it("keeps a gap between faixas as a pausa (#147)", () => {
    const slots = computeAvailableSlots({
      intervals: [
        { startTime: "09:00", endTime: "12:00" },
        { startTime: "13:00", endTime: "17:00" },
      ],
      rules,
      durationMinutes: 45,
      date: "2026-09-10",
      now,
      blocks: [],
      occupancies: [],
    });
    expect(slots).toContain("11:00");
    expect(slots).not.toContain("11:30");
    expect(slots).not.toContain("12:00");
    expect(slots).toContain("13:00");
  });

  it("returns an empty list when no intervals exist for the day", () => {
    const slots = computeAvailableSlots({
      intervals: [],
      rules,
      durationMinutes: 30,
      date: "2026-09-10",
      now,
      blocks: [],
      occupancies: [],
    });
    expect(slots).toEqual([]);
  });
});

describe("zonedTimeToUtc (§9.5 UTC conversion)", () => {
  it("converts São Paulo wall-clock (UTC-3) to the correct UTC instant", () => {
    expect(zonedTimeToUtc("2026-09-10", "12:00")).toBe("2026-09-10T15:00:00.000Z");
  });

  it("converte o horário usando o fuso do negócio", () => {
    expect(zonedTimeToUtc("2026-09-10", "12:00", "Europe/Lisbon")).toBe("2026-09-10T11:00:00.000Z");
  });

  it("respeita o fuso de Cuiabá", () => {
    expect(zonedTimeToUtc("2026-09-10", "12:00", "America/Cuiaba")).toBe("2026-09-10T16:00:00.000Z");
  });

  it("zonedTimeToUtcMs agrees with zonedTimeToUtc", () => {
    expect(new Date(zonedTimeToUtcMs("2026-09-10", "12:00")).toISOString()).toBe(
      zonedTimeToUtc("2026-09-10", "12:00"),
    );
  });
});

describe("localDayRangeUtc (§10.2 business-local day window)", () => {
  it("returns a 24h window spanning the business-local day in UTC", () => {
    const { start, end } = localDayRangeUtc("2026-09-10");
    // São Paulo is UTC-3: local midnight is 03:00Z that day, next local midnight is 03:00Z next day.
    expect(start).toBe("2026-09-10T03:00:00.000Z");
    expect(end).toBe("2026-09-11T03:00:00.000Z");
  });
});

describe("isValidSlot min_notice (§10.2 step 8)", () => {
  const rules: BusinessRules = {
    slotIntervalMinutes: 30,
    minNoticeMinutes: 120,
    bookingWindowDays: 60,
  };

  it("accepts a slot at least minNotice away using the real UTC instant", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    // Local 15:00 = UTC 18:00, exactly 6h after now -> within 120min notice.
    expect(isValidSlot("2026-09-10", "15:00", now, rules)).toBe(true);
  });

  it("rejects a slot within minNotice even if local wall-clock suggests otherwise", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    // Local 12:00 = UTC 15:00, 3h after now -> within notice (180min > 120min) -> true.
    expect(isValidSlot("2026-09-10", "12:00", now, rules)).toBe(true);
    // Local 09:00 = UTC 12:00, right at now -> too soon.
    expect(isValidSlot("2026-09-10", "09:00", now, rules)).toBe(false);
  });
});

// #190: fusos com horário de verão. No dia em que o relógio adianta, os
// horários do "buraco" não existem; no dia em que atrasa, a hora se repete.
describe("horário de verão (#190)", () => {
  const rules = (timezone: string): BusinessRules => ({
    slotIntervalMinutes: 30,
    minNoticeMinutes: 0,
    bookingWindowDays: 60,
    timezone,
  });
  const madrugada = (timezone: string, date: string, now: Date) =>
    computeAvailableSlots({
      intervals: [{ startTime: "00:00", endTime: "04:00" }],
      rules: rules(timezone),
      durationMinutes: 60,
      date,
      now,
      blocks: [],
      occupancies: [],
    });

  it("não oferece 02:00 e 02:30 em Nova York no dia em que o relógio adianta", () => {
    const slots = madrugada("America/New_York", "2027-03-14", new Date("2027-03-01T12:00:00Z"));

    expect(slots).toEqual(["00:00", "00:30", "01:00", "01:30", "03:00"]);
  });

  it("não oferece 01:00 e 01:30 em Lisboa no dia em que o relógio adianta", () => {
    const slots = madrugada("Europe/Lisbon", "2027-03-28", new Date("2027-03-15T12:00:00Z"));

    expect(slots).toEqual(["00:00", "00:30", "02:00", "02:30", "03:00"]);
  });

  it("sabe quais horários locais não existem", () => {
    expect(localTimeExists("2027-03-14", "02:00", "America/New_York")).toBe(false);
    expect(localTimeExists("2027-03-14", "02:30", "America/New_York")).toBe(false);
    expect(localTimeExists("2027-03-14", "03:00", "America/New_York")).toBe(true);
    expect(localTimeExists("2027-03-28", "01:00", "Europe/Lisbon")).toBe(false);
    expect(localTimeExists("2027-03-28", "01:30", "Europe/Lisbon")).toBe(false);
    expect(localTimeExists("2027-03-28", "02:00", "Europe/Lisbon")).toBe(true);
  });

  it("converte os horários que sobram para o instante certo", () => {
    expect(zonedTimeToUtc("2027-03-14", "01:30", "America/New_York")).toBe("2027-03-14T06:30:00.000Z");
    expect(zonedTimeToUtc("2027-03-14", "03:00", "America/New_York")).toBe("2027-03-14T07:00:00.000Z");
    expect(zonedTimeToUtc("2027-03-28", "00:30", "Europe/Lisbon")).toBe("2027-03-28T00:30:00.000Z");
    expect(zonedTimeToUtc("2027-03-28", "02:00", "Europe/Lisbon")).toBe("2027-03-28T01:00:00.000Z");
  });

  // A hora repetida existe duas vezes; o slot fica na primeira ocorrência
  // (ainda no horário de verão), nos dois fusos.
  it("usa a primeira ocorrência da hora repetida no dia em que o relógio atrasa", () => {
    expect(localTimeExists("2027-11-07", "01:30", "America/New_York")).toBe(true);
    expect(zonedTimeToUtc("2027-11-07", "01:30", "America/New_York")).toBe("2027-11-07T05:30:00.000Z");
    expect(localTimeExists("2027-10-31", "01:30", "Europe/Lisbon")).toBe(true);
    expect(zonedTimeToUtc("2027-10-31", "01:30", "Europe/Lisbon")).toBe("2027-10-31T00:30:00.000Z");

    const slots = madrugada("America/New_York", "2027-11-07", new Date("2027-11-01T12:00:00Z"));
    expect(slots).toEqual(["00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00"]);
  });

  it("não muda nada nos fusos brasileiros", () => {
    for (const timezone of ["America/Sao_Paulo", "America/Cuiaba", "America/Manaus", "America/Noronha"]) {
      const slots = madrugada(timezone, "2027-03-14", new Date("2027-03-01T12:00:00Z"));
      expect(slots).toEqual(["00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00"]);
    }
    expect(zonedTimeToUtc("2027-03-14", "02:00", "America/Sao_Paulo")).toBe("2027-03-14T05:00:00.000Z");
    expect(zonedTimeToUtc("2027-10-31", "01:30", "America/Noronha")).toBe("2027-10-31T03:30:00.000Z");
  });

  // O antigo horário de verão brasileiro começava à meia-noite: o dia local
  // começa no primeiro instante que existe, 01:00 (03:00Z).
  it("começa o dia no primeiro instante que existe quando a meia-noite não existe", () => {
    expect(localTimeExists("2018-11-04", "00:00", "America/Sao_Paulo")).toBe(false);
    expect(localDayRangeUtc("2018-11-04", "America/Sao_Paulo")).toEqual({
      start: "2018-11-04T03:00:00.000Z",
      end: "2018-11-05T02:00:00.000Z",
    });
  });
});

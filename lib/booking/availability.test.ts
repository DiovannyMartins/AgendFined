import { describe, expect, it } from "vitest";
import {
  computeAvailableSlots,
  generateSlotStartTimes,
  isWithinWindow,
  isValidSlot,
  localDayRangeUtc,
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

  it("ignora o segundo param de timezone (fuso fixo da aplicação)", () => {
    expect(zonedTimeToUtc("2026-09-10", "12:00", "Europe/Lisbon")).toBe("2026-09-10T15:00:00.000Z");
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

import { APP_TIMEZONE } from "@/lib/app-timezone";

export interface SlotInterval {
  startTime: string;
  endTime: string;
}

export type TimeRange = { start: string; end: string };

// A UTC range. We keep the epoch-millisecond form internally so comparisons are
// timezone/format-agnostic (timestamptz may arrive as "+00:00" or "Z"), and the
// component builds/serialises it only when talking to the DB.
export type UtcRange = { startMs: number; endMs: number };

export interface BusinessRules {
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  bookingWindowDays: number;
  // Removido: timezone por negócio. Mantido opcional para compat temporária.
  timezone?: string;
}

// Overlap of two local wall-clock faixas represented as HH:MM. Valid only for
// same-day intervals: §8.5 forbids a faixa crossing midnight, so HH:MM string
// order is a faithful time order.
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && a.end > b.start;
}

// Half-open interval overlap in UTC (epoch ms). See §10.3.
export function overlapsUtc(a: UtcRange, b: UtcRange): boolean {
  return a.startMs < b.endMs && a.endMs > b.startMs;
}

// Normalise a DB timestamptz pair (ISO string, may be "+00:00" or "Z") to an
// epoch-ms range so overlaps are format-agnostic.
export function toUtcRange(startIso: string, endIso: string): UtcRange {
  return { startMs: new Date(startIso).getTime(), endMs: new Date(endIso).getTime() };
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function tzOffsetMinutes(timezone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const localAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return (localAsUtc - utcMs) / 60_000;
}

export function timeToMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function generateSlotStartTimes(
  interval: SlotInterval,
  slotIntervalMinutes: number,
  durationMinutes: number,
): string[] {
  const startMinutes = timeToMinutes(interval.startTime);
  const endMinutes = timeToMinutes(interval.endTime);

  const candidates: string[] = [];
  for (let t = startMinutes; t < endMinutes; t += slotIntervalMinutes) {
    if (t + durationMinutes > endMinutes) break;
    candidates.push(minutesToTime(t));
  }
  return candidates;
}

export function toLocalDate(date: Date, timezone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

// Last calendar date (YYYY-MM-DD, business-local) inside the janela futura.
export function lastBookableDate(now: Date, timezone: string | undefined, bookingWindowDays: number): string {
  const windowEnd = new Date(toLocalDate(now, timezone) + "T00:00:00Z");
  windowEnd.setUTCDate(windowEnd.getUTCDate() + bookingWindowDays);
  return windowEnd.toISOString().slice(0, 10);
}

export function isWithinWindow(date: string, rules: BusinessRules, now: Date): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const today = new Date(toLocalDate(now, rules.timezone) + "T00:00:00Z");
  const windowEnd = new Date(lastBookableDate(now, rules.timezone, rules.bookingWindowDays) + "T00:00:00Z");
  return target >= today && target <= windowEnd;
}

export function zonedTimeToUtcMs(date: string, time: string, timezone: string = APP_TIMEZONE): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // UTC instant whose local wall-clock reading in `timezone` equals date+time.
  // Iterate to converge on DST-aware offsets.
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let guess = naive - tzOffsetMinutes(timezone, naive) * 60_000;
  guess = naive - tzOffsetMinutes(timezone, guess) * 60_000;
  guess = naive - tzOffsetMinutes(timezone, guess) * 60_000;
  return guess;
}

export function zonedTimeToUtc(date: string, time: string, timezone: string = APP_TIMEZONE): string {
  return new Date(zonedTimeToUtcMs(date, time, timezone)).toISOString();
}

// Wall-clock "YYYY-MM-DDTHH:MM[:SS]" (e.g. from datetime-local) read in
// `timezone`, as a UTC ISO instant. Seconds are ignored, matching the minute
// granularity of slots.
export function localDateTimeToUtc(value: string, timezone: string = APP_TIMEZONE): string {
  const [date, time] = value.split("T");
  return zonedTimeToUtc(date, time.slice(0, 5), timezone);
}

// Inclusive start / exclusive end of the local calendar day `date`,
// expressed as UTC instants.
export function localDayRangeUtc(date: string, timezone: string = APP_TIMEZONE): { start: string; end: string } {
  const startMs = zonedTimeToUtcMs(date, "00:00", timezone);
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const endMs = zonedTimeToUtcMs(nextDate, "00:00", timezone);
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

// Weekday of a local date (ISO yyyy-mm-dd), as 1=Sun..7=Sat.
// Mirrors JS Date.getDay()+1, which is the convention the availability form
// exposes (1 - Domingo, 2 - Segunda, ... 7 - Sábado).
export function weekdayOf(date: string, timezone: string = APP_TIMEZONE): number {
  void timezone;
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 1;
}

export function isValidSlot(date: string, start: string, now: Date, rules: BusinessRules): boolean {
  // Convert the local date+time to its real UTC instant, then measure
  // the notice against "now" on the same UTC timeline.
  const slotInstant = zonedTimeToUtcMs(date, start, rules.timezone);
  const noticeMs = rules.minNoticeMinutes * 60 * 1000;
  return slotInstant - now.getTime() >= noticeMs;
}

export function computeAvailableSlots(params: {
  intervals: SlotInterval[];
  rules: BusinessRules;
  durationMinutes: number;
  date: string;
  now: Date;
  blocks: UtcRange[];
  occupancies: UtcRange[];
}): string[] {
  const { intervals, rules, durationMinutes, date, now, blocks, occupancies } = params;

  if (!isWithinWindow(date, rules, now)) return [];

  const available: string[] = [];
  for (const interval of intervals) {
    const starts = generateSlotStartTimes(interval, rules.slotIntervalMinutes, durationMinutes);
    for (const start of starts) {
      // Build the candidate in UTC (local slot -> UTC), per §9.5/§10.3.
      const startMs = zonedTimeToUtcMs(date, start, rules.timezone);
      const candidateUtc: UtcRange = {
        startMs,
        endMs: startMs + durationMinutes * 60_000,
      };
      if (blocks.some((b) => overlapsUtc(candidateUtc, b))) continue;
      if (occupancies.some((o) => overlapsUtc(candidateUtc, o))) continue;
      if (!isValidSlot(date, start, now, rules)) continue;
      available.push(start);
    }
  }
  return available.sort();
}

import { describe, expect, it } from "vitest";
import { splitBlocksByTime } from "./blocks";

const block = (id: string, start_at: string, end_at: string) => ({ id, start_at, end_at });

describe("splitBlocksByTime", () => {
  it("puts the next bloqueio first and the ended ones after, most recent first", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    const farFuture = block("far", "2026-12-20T00:00:00Z", "2027-01-05T00:00:00Z");
    const next = block("next", "2026-10-20T15:00:00Z", "2026-10-20T16:00:00Z");
    const ongoing = block("ongoing", "2026-10-19T11:00:00Z", "2026-10-19T13:00:00Z");
    const lastWeek = block("last-week", "2026-10-12T15:00:00Z", "2026-10-12T16:00:00Z");
    const lastMonth = block("last-month", "2026-09-12T15:00:00Z", "2026-09-12T16:00:00Z");

    const { current, past } = splitBlocksByTime([farFuture, lastMonth, next, lastWeek, ongoing], now);

    expect(current.map((b) => b.id)).toEqual(["ongoing", "next", "far"]);
    expect(past.map((b) => b.id)).toEqual(["last-week", "last-month"]);
  });
});

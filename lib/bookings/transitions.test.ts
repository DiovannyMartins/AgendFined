import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS, canTransition, isTerminal, isTooEarlyFor } from "@/lib/bookings/transitions";

describe("canTransition (§11.2)", () => {
  it("confirmed can go to completed, cancelled, no_show", () => {
    expect(canTransition("confirmed", "completed")).toBe(true);
    expect(canTransition("confirmed", "cancelled")).toBe(true);
    expect(canTransition("confirmed", "no_show")).toBe(true);
  });

  it("confirmed cannot go to confirmed", () => {
    expect(canTransition("confirmed", "confirmed")).toBe(false);
  });

  it("terminal states cannot transition", () => {
    expect(canTransition("completed", "confirmed")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("no_show", "completed")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("marks completed, cancelled and no_show as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("no_show")).toBe(true);
  });

  it("confirmed is not terminal", () => {
    expect(isTerminal("confirmed")).toBe(false);
  });
});

describe("ALLOWED_TRANSITIONS table", () => {
  it("matches the spec §11.2 transitions", () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      confirmed: ["completed", "cancelled", "no_show"],
      completed: [],
      cancelled: [],
      no_show: [],
    });
  });
});

describe("isTooEarlyFor (#78)", () => {
  const startAt = "2026-10-19T15:00:00.000Z";

  it("blocks completed and no_show before the reserva starts", () => {
    const before = new Date("2026-10-19T14:59:59.000Z");
    expect(isTooEarlyFor("completed", startAt, before)).toBe(true);
    expect(isTooEarlyFor("no_show", startAt, before)).toBe(true);
  });

  it("allows completed and no_show from the start instant on", () => {
    expect(isTooEarlyFor("completed", startAt, new Date(startAt))).toBe(false);
    expect(isTooEarlyFor("no_show", startAt, new Date("2026-10-19T16:00:00.000Z"))).toBe(false);
  });

  it("never blocks cancelling", () => {
    expect(isTooEarlyFor("cancelled", startAt, new Date("2026-10-01T00:00:00.000Z"))).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const { syncGoogleCalendarBooking } = vi.hoisted(() => ({
  syncGoogleCalendarBooking: vi.fn<(businessId: string, bookingId: string) => Promise<void>>(async () => {}),
}));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarBooking }));

import { runAfterResponse, syncGoogleCalendarBookingAfterResponse } from "@/lib/after-response";
import { flushAfterResponse, pendingAfterResponse } from "@/tests/mocks/after-response";

describe("runAfterResponse (#217)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("only runs the task after the response", async () => {
    const task = vi.fn(async () => {});

    runAfterResponse("some_task_failed", { bookingId: "booking-1" }, task);

    expect(task).not.toHaveBeenCalled();
    expect(pendingAfterResponse()).toBe(1);
    await flushAfterResponse();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("logs a failure under its event instead of throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    runAfterResponse("some_task_failed", { bookingId: "booking-1" }, async () => {
      throw new Error("provider down");
    });

    await expect(flushAfterResponse()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("some_task_failed", { bookingId: "booking-1", reason: "provider down" });
  });

  it("syncs the reserva with Google after the response, logging a Google outage", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    syncGoogleCalendarBooking.mockRejectedValueOnce("not an error");

    syncGoogleCalendarBookingAfterResponse("business-1", "booking-1");

    expect(syncGoogleCalendarBooking).not.toHaveBeenCalled();
    await flushAfterResponse();
    expect(syncGoogleCalendarBooking).toHaveBeenCalledWith("business-1", "booking-1");
    expect(consoleError).toHaveBeenCalledWith("google_calendar_booking_sync_failed", {
      bookingId: "booking-1",
      reason: "unknown",
    });
  });
});

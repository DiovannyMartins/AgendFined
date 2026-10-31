import "server-only";
import { after } from "next/server";
import { syncGoogleCalendarBooking } from "@/lib/google-calendar/sync";

// Runs a side effect after the response is sent (#217), for work the user must
// not wait for: the Google Calendar sync and the dono's aviso. A failure there
// can no longer reach the response, so it is only logged under failureEvent.
export function runAfterResponse(
  failureEvent: string,
  details: Record<string, string>,
  task: () => Promise<unknown>,
): void {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error(failureEvent, { ...details, reason: error instanceof Error ? error.message : "unknown" });
    }
  });
}

// Best effort: a Google outage never fails the reserva, and the periodic
// scheduler remains the safety net.
export function syncGoogleCalendarBookingAfterResponse(businessId: string, bookingId: string): void {
  runAfterResponse("google_calendar_booking_sync_failed", { bookingId }, () =>
    syncGoogleCalendarBooking(businessId, bookingId),
  );
}

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no_show";

// §11.2 Transitions permitted by the MVP. A reserva leaves confirmed once and
// never returns. completed and no_show both record an appointment that already
// happened, so a wrong click can be corrected between them (#145); cancelled
// stays final because the horário may already have been rebooked.
export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  confirmed: ["completed", "cancelled", "no_show"],
  completed: ["no_show"],
  cancelled: [],
  no_show: ["completed"],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminal(status: BookingStatus): boolean {
  return status !== "confirmed";
}

// completed and no_show record what happened at the appointment, so they are
// only allowed once the reserva has started (start_at <= now). Cancelling
// stays allowed at any time.
const REQUIRES_STARTED: BookingStatus[] = ["completed", "no_show"];

export function requiresStarted(to: BookingStatus): boolean {
  return REQUIRES_STARTED.includes(to);
}

export function isTooEarlyFor(to: BookingStatus, startAt: string, now: Date): boolean {
  return requiresStarted(to) && Date.parse(startAt) > now.getTime();
}

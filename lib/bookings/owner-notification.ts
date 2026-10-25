import "server-only";

import { resolveAppOrigin } from "@/lib/app-origin";
import {
  sendOwnerCustomerCancelledEmail,
  sendOwnerCustomerRescheduledEmail,
  sendOwnerNewBookingEmail,
} from "@/lib/email/owner-booking-notification";
import type { createAdminClient } from "@/lib/supabase/admin";

// Tells the dono about what the cliente did on the public page (#146): a
// reserva nova, or a cancellation or remarcação (#194) through the private
// link. It goes to the
// e-mail of the account that owns the negócio, in every plano, as soon as it
// happens. Best effort, like the confirmação: nothing here ever throws, so a
// failure never undoes the reserva or the cancellation; it is only logged,
// without the dono's e-mail.
export type OwnerBookingEvent = "new_booking" | "customer_cancelled" | "customer_rescheduled";

export type OwnerNotificationBooking = {
  bookingId: string;
  ownerId: string;
  businessName: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  startAt: string;
  timezone: string;
  publicCode: string;
  customerNote?: string | null;
  customerNoteRequiresFollowUp?: boolean;
  // customer_rescheduled only: the horário the remarcação freed.
  previousStartAt?: string;
};

const SENDERS = {
  new_booking: sendOwnerNewBookingEmail,
  customer_cancelled: sendOwnerCustomerCancelledEmail,
  customer_rescheduled: sendOwnerCustomerRescheduledEmail,
} satisfies Record<OwnerBookingEvent, unknown>;

export async function notifyOwner(
  admin: ReturnType<typeof createAdminClient>,
  event: OwnerBookingEvent,
  booking: OwnerNotificationBooking,
): Promise<void> {
  const logFailure = (reason: string) =>
    console.error("owner_notification_email_failed", { bookingId: booking.bookingId, event, reason });

  try {
    const { data } = await admin.auth.admin.getUserById(booking.ownerId);
    const ownerEmail = data.user?.email;
    if (!ownerEmail) return logFailure("owner_email_not_found");

    const result = await SENDERS[event]({
      ownerEmail,
      businessName: booking.businessName,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      serviceName: booking.serviceName,
      startAt: booking.startAt,
      timezone: booking.timezone,
      publicCode: booking.publicCode,
      customerNote: booking.customerNote,
      customerNoteRequiresFollowUp: booking.customerNoteRequiresFollowUp,
      previousStartAt: booking.previousStartAt,
      agendaUrl: new URL("/dashboard/agenda", resolveAppOrigin()).toString(),
    });
    if (!result.sent) logFailure(result.reason);
  } catch {
    logFailure("unexpected_error");
  }
}

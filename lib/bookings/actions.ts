"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import { canTransition, isTooEarlyFor, type BookingStatus } from "@/lib/bookings/transitions";
import { bookingStatusSchema } from "@/lib/validation/schemas";
import { classifyCancellationReason } from "@/lib/bookings/classification";
import { statusLabel } from "@/lib/bookings/status";
import { syncGoogleCalendarBookingAfterResponse } from "@/lib/after-response";
import { sendBusinessCancelledEmail } from "@/lib/email/booking-cancellation";
import { spendOwnerEmail } from "@/lib/email/owner-email-budget";
import { buildPublicBookingUrl } from "@/lib/bookings/public-booking-url";
import { resolveAppOrigin } from "@/lib/app-origin";

export async function updateBookingStatus(
  _prev: { ok: boolean; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const id = String(formData.get("id") ?? "");
  const nextStatusValue = String(formData.get("status") ?? "");
  const nextStatusParsed = bookingStatusSchema.safeParse(nextStatusValue);
  const nextStatus = nextStatusParsed.success ? nextStatusParsed.data : null;
  const cancelReasonValue = String(formData.get("cancelReason") ?? "").trim();
  const cancelReason = cancelReasonValue || null;

  if (!id) return { ok: false, message: "Reserva inválida." };
  if (!nextStatus) {
    return { ok: false, message: "Status inválido." };
  }
  // Same limit as bookings.cancel_reason and the agenda input.
  if (cancelReasonValue.length > 250) return { ok: false, message: "O motivo do cancelamento é muito longo." };

  const business = await getCurrentBusiness();
  if (!business) return { ok: false, message: "Configure seu negócio primeiro." };

  const supabase = await createClient();

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, start_at, public_code, customer_name_snapshot, customer_email_snapshot, service_name_snapshot")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (fetchError || !booking) return { ok: false, message: "Reserva não encontrada." };

  const current = booking.status as BookingStatus;
  if (!canTransition(current, nextStatus)) {
    return { ok: false, message: `Não é possível mudar de "${statusLabel(current).label}" para "${statusLabel(nextStatus).label}".` };
  }
  if (isTooEarlyFor(nextStatus, booking.start_at, new Date())) {
    return { ok: false, message: "Só é possível marcar após o início do atendimento." };
  }

  const { error, data: updated } = await supabase
    .from("bookings")
    .update({
      status: nextStatus,
      ...(nextStatus === "cancelled" ? { cancel_reason: cancelReason } : {}),
    })
    .eq("id", id)
    .eq("business_id", business.id)
    .eq("status", current)
    .select("id");

  if (error) return { ok: false, message: "Não foi possível atualizar a reserva." };
  if (!updated || updated.length === 0) {
    return { ok: false, message: "A reserva foi alterada por outra operação. Atualize a página e tente novamente." };
  }

  // Best effort, like the confirmação por e-mail: a delivery failure never
  // undoes the cancellation, it is only logged. Past the negócio's e-mail
  // budget the e-mail is skipped and the dono warns the cliente by WhatsApp.
  const emailSkipped = nextStatus === "cancelled" && !!booking.customer_email_snapshot
    && !await spendOwnerEmail(business, booking.customer_email_snapshot, "cancellation");
  if (nextStatus === "cancelled" && booking.customer_email_snapshot && !emailSkipped) {
    const emailResult = await sendBusinessCancelledEmail({
      customerName: booking.customer_name_snapshot,
      customerEmail: booking.customer_email_snapshot,
      businessName: business.name,
      serviceName: booking.service_name_snapshot,
      startAt: booking.start_at,
      timezone: business.timezone,
      publicCode: booking.public_code,
      rebookUrl: buildPublicBookingUrl(resolveAppOrigin(), business.slug),
      businessPhone: business.phone,
    });
    if (!emailResult.sent) {
      console.error("booking_cancellation_email_failed", { bookingId: id, reason: emailResult.reason });
    }
  }

  if (nextStatus === "cancelled" && cancelReason) {
    const judgment = await classifyCancellationReason(cancelReason);
    if (judgment && judgment.confidence >= 0.7) {
      await supabase
        .from("bookings")
        .update({ cancel_reason_category: judgment.category })
        .eq("id", id)
        .eq("business_id", business.id);
    }
  }

  if (nextStatus === "cancelled") syncGoogleCalendarBookingAfterResponse(business.id, id);

  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard/clientes");
  if (emailSkipped) {
    return { ok: true, message: "Reserva cancelada, mas o e-mail não saiu. Avise o cliente pelo WhatsApp." };
  }
  return { ok: true };
}

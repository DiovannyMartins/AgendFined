"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import { canTransition, type BookingStatus } from "@/lib/bookings/transitions";
import { bookingStatusSchema } from "@/lib/validation/schemas";
import { classifyCancellationReason } from "@/lib/typesafe/judgments";

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
  if (cancelReasonValue.length > 500) return { ok: false, message: "O motivo do cancelamento é muito longo." };

  const business = await getCurrentBusiness();
  if (!business) return { ok: false, message: "Configure seu negócio primeiro." };

  const supabase = await createClient();

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (fetchError || !booking) return { ok: false, message: "Reserva não encontrada." };

  const current = booking.status as BookingStatus;
  if (!canTransition(current, nextStatus)) {
    return { ok: false, message: `Não é possível mudar de "${current}" para "${nextStatus}".` };
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

  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard/clientes");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import { ownerRescheduleSchema } from "@/lib/validation/schemas";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { isOutsideAvailability, listOwnerFreeSlots, resolveOwnerStart } from "@/lib/bookings/owner-slots";
import { buildPublicConfirmationUrl } from "@/lib/bookings/public-booking-url";
import { sendBusinessRescheduledEmail } from "@/lib/email/booking-reschedule";
import { syncGoogleCalendarBooking } from "@/lib/google-calendar/sync";
import { resolveAppOrigin } from "@/lib/app-origin";

// Remarcação pelo dono (#194, ADR 0010): the same reserva moves to another
// horário, keeping its code, private link, snapshot and Google Calendar event.
// Same rules as the reserva pelo painel (#193): start in the future and the plan
// limit, no antecedência nor configured janela, and an encaixe outside the
// faixas only when the dono confirms it. Bloqueios and sobreposição stay in the
// database (reschedule_owner_booking, ADR 0003).

export type OwnerRescheduleResult = {
  ok: boolean;
  code?:
    | "validation"
    | "no_business"
    | "not_found"
    | "not_reschedulable"
    | "same_start"
    | "outside_availability"
    | "past"
    | "booking_window"
    | "blocked"
    | "slot_taken"
    | "db_error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  // Local date of the new horário, the agenda's `?data=` filter.
  agendaDate?: string;
  startAt?: string;
  publicCode?: string;
  customerName?: string;
  customerPhone?: string;
  // The cliente did not get the e-mail: the dono warns them by WhatsApp.
  notifyByWhatsApp?: boolean;
};

const DB_ERROR: OwnerRescheduleResult = {
  ok: false,
  code: "db_error",
  message: "Não foi possível remarcar a reserva. Tente novamente.",
};

const NOT_RESCHEDULABLE: OwnerRescheduleResult = {
  ok: false,
  code: "not_reschedulable",
  message: "Só é possível remarcar uma reserva confirmada que ainda não começou.",
};

const BOOKING_COLUMNS =
  "id, status, start_at, duration_minutes_snapshot, public_code, customer_name_snapshot, customer_email_snapshot, service_name_snapshot";

export async function rescheduleOwnerBooking(
  _prev: OwnerRescheduleResult,
  formData: FormData,
): Promise<OwnerRescheduleResult> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const parsed = ownerRescheduleSchema.safeParse({
    bookingId: field("bookingId"),
    date: field("date"),
    startTime: field("startTime"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const input = parsed.data;
  const allowOutsideAvailability = formData.get("encaixe") === "on";

  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "no_business", message: "Configure seu negócio primeiro." };
  const timezone = business.timezone || APP_TIMEZONE;

  const supabase = await createClient();
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", input.bookingId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (bookingError) return DB_ERROR;
  if (!booking) return { ok: false, code: "not_found", message: "Reserva não encontrada." };
  if (booking.status !== "confirmed" || Date.parse(booking.start_at) <= Date.now()) return NOT_RESCHEDULABLE;

  const start = resolveOwnerStart(input.date, input.startTime, business, timezone, new Date());
  if (!start.ok) return start;
  const { startAt } = start;
  if (Date.parse(startAt) === Date.parse(booking.start_at)) {
    return { ok: false, code: "same_start", message: "A reserva já está nesse horário. Escolha outro." };
  }

  if (!allowOutsideAvailability) {
    const outside = await isOutsideAvailability(
      supabase,
      business.id,
      timezone,
      startAt,
      booking.duration_minutes_snapshot,
    );
    if (outside === null) return DB_ERROR;
    if (outside) {
      return {
        ok: false,
        code: "outside_availability",
        message: "Esse horário fica fora da sua disponibilidade. Marque “Encaixe” para remarcar mesmo assim.",
      };
    }
  }

  const { data: moved, error } = await supabase.rpc("reschedule_owner_booking", {
    p_booking_id: booking.id,
    p_start_at: startAt,
  });
  if (error || !moved) return rpcErrorResult(error);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard/clientes");

  // Same deterministic event id, so the event moves instead of being recreated.
  try {
    await syncGoogleCalendarBooking(business.id, moved.id);
  } catch (syncError) {
    console.error("google_calendar_booking_sync_failed", {
      bookingId: moved.id,
      reason: syncError instanceof Error ? syncError.message : "unknown",
    });
  }

  const done: OwnerRescheduleResult = {
    ok: true,
    agendaDate: input.date,
    startAt: moved.start_at,
    publicCode: moved.public_code,
    customerName: moved.customer_name_snapshot,
    customerPhone: moved.customer_phone_snapshot,
  };
  if (!moved.customer_email_snapshot) {
    return {
      ...done,
      notifyByWhatsApp: true,
      message: "Reserva remarcada. O cliente não tem e-mail: avise o novo horário pelo WhatsApp.",
    };
  }

  // Best effort, like the cancellation e-mail: a delivery failure never undoes
  // the remarcação, the dono is told to warn the cliente instead.
  const emailResult = await sendBusinessRescheduledEmail({
    customerName: moved.customer_name_snapshot,
    customerEmail: moved.customer_email_snapshot,
    businessName: business.name,
    serviceName: moved.service_name_snapshot,
    previousStartAt: booking.start_at,
    startAt: moved.start_at,
    timezone,
    publicCode: moved.public_code,
    bookingUrl: buildPublicConfirmationUrl(resolveAppOrigin(), business.slug, moved.public_code),
    businessPhone: business.phone,
  });
  if (!emailResult.sent) {
    console.error("booking_reschedule_email_failed", { bookingId: moved.id, reason: emailResult.reason });
    return {
      ...done,
      notifyByWhatsApp: true,
      message: "Reserva remarcada, mas o e-mail não saiu. Avise o novo horário pelo WhatsApp.",
    };
  }
  return { ...done, message: `Reserva remarcada. O cliente foi avisado por e-mail (${moved.customer_email_snapshot}).` };
}

// Free horários of a day for the remarcação, with the reserva's own snapshot
// duration and without counting the reserva itself as occupied.
export async function getOwnerRescheduleSlots(
  bookingId: string,
  date: string,
): Promise<{ available: string[]; error?: "validation" | "no_business" | "db_error" }> {
  const parsed = ownerRescheduleSchema.pick({ bookingId: true, date: true }).safeParse({ bookingId, date });
  if (!parsed.success) return { available: [], error: "validation" };

  const business = await getCurrentBusiness();
  if (!business) return { available: [], error: "no_business" };
  const timezone = business.timezone || APP_TIMEZONE;

  const supabase = await createClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, start_at, duration_minutes_snapshot")
    .eq("id", bookingId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (error) return { available: [], error: "db_error" };
  if (!booking) return { available: [], error: "validation" };

  const available = await listOwnerFreeSlots(supabase, business, timezone, {
    date,
    durationMinutes: booking.duration_minutes_snapshot,
    rescheduling: { id: booking.id, startAt: booking.start_at },
  });
  return available ? { available } : { available: [], error: "db_error" };
}

function rpcErrorResult(error: { message?: string; code?: string } | null): OwnerRescheduleResult {
  const message = String(error?.message ?? "");
  if (/BOOKING_NOT_FOUND/.test(message)) return { ok: false, code: "not_found", message: "Reserva não encontrada." };
  if (/BOOKING_NOT_CONFIRMED|BOOKING_ALREADY_STARTED/.test(message)) return NOT_RESCHEDULABLE;
  if (/BOOKING_SAME_START/.test(message)) {
    return { ok: false, code: "same_start", message: "A reserva já está nesse horário. Escolha outro." };
  }
  if (/BOOKING_IN_PAST/.test(message)) {
    return { ok: false, code: "past", message: "Esse horário já passou. Escolha um horário no futuro." };
  }
  if (/BOOKING_OUTSIDE_PLAN_WINDOW/.test(message)) {
    return { ok: false, code: "booking_window", message: "Seu plano não permite reservas para essa data." };
  }
  if (/BOOKING_BLOCK_OVERLAP/.test(message)) {
    return {
      ok: false,
      code: "blocked",
      message: "Esse horário está dentro de um bloqueio. Remova o bloqueio ou escolha outro horário.",
    };
  }
  if (error?.code === "23P01" || /bookings_no_overlap/.test(message)) {
    return { ok: false, code: "slot_taken", message: "Já existe uma reserva nesse horário. Escolha outro." };
  }
  return DB_ERROR;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import { ownerBookingSchema } from "@/lib/validation/schemas";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { isOutsideAvailability, listOwnerFreeSlots, resolveOwnerStart } from "@/lib/bookings/owner-slots";
import { generateCancelToken, hashCancelToken } from "@/lib/bookings/cancel";
import { buildPrivateConfirmationUrl } from "@/lib/bookings/private-confirmation";
import { sendBookingConfirmationEmail } from "@/lib/email/booking-confirmation";
import { spendOwnerEmail } from "@/lib/email/owner-email-budget";
import { syncGoogleCalendarBooking } from "@/lib/google-calendar/sync";
import { resolveAppOrigin } from "@/lib/app-origin";

// Reserva criada pelo dono no painel (#193), para o cliente que marcou por
// WhatsApp, telefone ou no balcão. Não passa pelo Turnstile nem pelo limite
// por IP do fluxo público, e a antecedência e a janela configurada não valem
// para o dono: só o limite do plano e o início no futuro (create_owner_booking).
// Bloqueios e sobreposição seguem no banco (ADR 0003). Fora das faixas de
// disponibilidade, o dono confirma o encaixe explicitamente.
//
// Como na conversão da lista de espera, o link privado com o token de
// cancelamento (ADR 0005) só existe nesta resposta: vai no e-mail quando o
// cliente tem um e é devolvido ao dono para enviar pelo WhatsApp.

export type OwnerBookingResult = {
  ok: boolean;
  code?:
    | "validation"
    | "no_business"
    | "outside_availability"
    | "past"
    | "booking_window"
    | "service_not_found"
    | "blocked"
    | "slot_taken"
    | "db_error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  publicCode?: string;
  confirmationUrl?: string;
  // Local date of the reserva, the agenda's `?data=` filter.
  agendaDate?: string;
  customerName?: string;
  customerPhone?: string;
};

const DB_ERROR: OwnerBookingResult = {
  ok: false,
  code: "db_error",
  message: "Não foi possível criar a reserva. Tente novamente.",
};

export async function createOwnerBooking(
  _prev: OwnerBookingResult,
  formData: FormData,
): Promise<OwnerBookingResult> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const parsed = ownerBookingSchema.safeParse({
    serviceId: field("serviceId"),
    date: field("date"),
    startTime: field("startTime"),
    customerName: field("customerName"),
    customerPhone: field("customerPhone"),
    customerEmail: field("customerEmail"),
    customerNote: field("customerNote"),
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

  const start = resolveOwnerStart(input.date, input.startTime, business, timezone, new Date());
  if (!start.ok) return start;
  const { startAt } = start;

  const supabase = await createClient();
  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, duration_minutes, is_active")
    .eq("id", input.serviceId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (serviceError) return DB_ERROR;
  if (!service || !service.is_active) {
    return { ok: false, code: "service_not_found", message: "Serviço indisponível. Escolha outro." };
  }

  if (!allowOutsideAvailability) {
    const outside = await isOutsideAvailability(supabase, business.id, timezone, startAt, service.duration_minutes);
    if (outside === null) return DB_ERROR;
    if (outside) {
      return {
        ok: false,
        code: "outside_availability",
        message: "Esse horário fica fora da sua disponibilidade. Marque “Encaixe” para criar a reserva mesmo assim.",
      };
    }
  }

  const cancelToken = generateCancelToken();
  const { data: booking, error } = await supabase.rpc("create_owner_booking", {
    p_service_id: service.id,
    p_start_at: startAt,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail || undefined,
    p_customer_note: input.customerNote || undefined,
    p_cancel_token_hash: hashCancelToken(cancelToken),
  });
  if (error || !booking) return rpcErrorResult(error);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard/clientes");

  // Calendar sync is best effort, as for a public reserva.
  try {
    await syncGoogleCalendarBooking(business.id, booking.id);
  } catch (syncError) {
    console.error("google_calendar_booking_sync_failed", {
      bookingId: booking.id,
      reason: syncError instanceof Error ? syncError.message : "unknown",
    });
  }

  const confirmationUrl = buildPrivateConfirmationUrl(resolveAppOrigin(), business.slug, booking.public_code, cancelToken);
  const created: OwnerBookingResult = {
    ok: true,
    publicCode: booking.public_code,
    confirmationUrl,
    agendaDate: input.date,
    customerName: booking.customer_name_snapshot,
    customerPhone: booking.customer_phone_snapshot,
  };

  if (!booking.customer_email_snapshot) {
    return { ...created, message: "Sem e-mail do cliente. Envie o link da confirmação pelo WhatsApp." };
  }

  const emailNotSent = "Não foi possível enviar o e-mail. Envie o link da confirmação pelo WhatsApp.";
  if (!await spendOwnerEmail(business.id, "booking_confirmation")) return { ...created, message: emailNotSent };

  const emailResult = await sendBookingConfirmationEmail({
    customerName: booking.customer_name_snapshot,
    customerEmail: booking.customer_email_snapshot,
    businessName: business.name,
    serviceName: booking.service_name_snapshot,
    startAt: booking.start_at,
    timezone,
    publicCode: booking.public_code,
    businessPhone: business.phone,
    confirmationUrl,
  });
  if (!emailResult.sent) {
    console.error("booking_confirmation_email_failed", { bookingId: booking.id, reason: emailResult.reason });
    return { ...created, message: emailNotSent };
  }
  return { ...created, message: `Confirmação enviada por e-mail para ${booking.customer_email_snapshot}.` };
}

// Free horários of a day for the dono's form: the same slots as the public
// page, but without the antecedência and with the plan limit as the janela.
// The dono can still type any other horário as an encaixe.
export async function getOwnerSlots(
  serviceId: string,
  date: string,
): Promise<{ available: string[]; error?: "validation" | "no_business" | "db_error" }> {
  const parsed = ownerBookingSchema.pick({ serviceId: true, date: true }).safeParse({ serviceId, date });
  if (!parsed.success) return { available: [], error: "validation" };

  const business = await getCurrentBusiness();
  if (!business) return { available: [], error: "no_business" };
  const timezone = business.timezone || APP_TIMEZONE;

  const supabase = await createClient();
  const service = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .eq("business_id", business.id)
    .eq("is_active", true)
    .maybeSingle();
  if (service.error) return { available: [], error: "db_error" };
  if (!service.data) return { available: [], error: "validation" };

  const available = await listOwnerFreeSlots(supabase, business, timezone, {
    date,
    durationMinutes: service.data.duration_minutes,
  });
  return available ? { available } : { available: [], error: "db_error" };
}

function rpcErrorResult(error: { message?: string; code?: string } | null): OwnerBookingResult {
  const message = String(error?.message ?? "");
  if (/BOOKING_IN_PAST/.test(message)) {
    return { ok: false, code: "past", message: "Esse horário já passou. Escolha um horário no futuro." };
  }
  if (/BOOKING_OUTSIDE_PLAN_WINDOW/.test(message)) {
    return { ok: false, code: "booking_window", message: "Seu plano não permite reservas para essa data." };
  }
  if (/SERVICE_NOT_FOUND|SERVICE_INACTIVE/.test(message)) {
    return { ok: false, code: "service_not_found", message: "Serviço indisponível. Escolha outro." };
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

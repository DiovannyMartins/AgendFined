"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database-types";
import { publicCodeSchema, publicSlotSchema } from "@/lib/validation/schemas";
import { hashCancelToken, isValidCancelToken } from "@/lib/bookings/cancel";
import {
  computeAvailableSlots,
  isWithinWindow,
  localDayRangeUtc,
  localTimeExists,
  toUtcRange,
  weekdayOf,
  zonedTimeToUtc,
} from "@/lib/booking/availability";
import { enforceAvailabilityRateLimit, enforceConsultRateLimit, getClientIp } from "@/lib/booking/rate-limit";
import { getEffectiveBookingWindowDays, type Plan } from "@/lib/plan/plan";
import { sendCustomerRescheduledEmail } from "@/lib/email/booking-reschedule";
import { notifyOwner } from "@/lib/bookings/owner-notification";
import { syncGoogleCalendarBooking } from "@/lib/google-calendar/sync";
import { buildPublicConfirmationUrl } from "@/lib/bookings/public-booking-url";
import { BOOKING_ALREADY_STARTED_MESSAGE } from "@/lib/bookings/public-status";
import { resolveAppOrigin } from "@/lib/app-origin";

// Remarcação pelo cliente (#194, ADR 0010), through the private link of the
// confirmação: the cancellation token (ADR 0005) also authorizes moving the
// reserva. The new horário follows the public page's rules (faixas,
// antecedência, effective janela, bloqueios and the other reservas), with the
// reserva's own snapshot duration; the reserva itself does not count as
// occupied, so it can move inside its current range. The database rechecks
// everything but the faixas (reschedule_booking_by_public_code).

type ServerClient = ReturnType<typeof createAdminClient>;

export type PublicRescheduleState =
  | { status: "idle" }
  | { status: "done"; startAt: string }
  | {
      status: "error";
      code:
        | "INVALID_TOKEN"
        | "VALIDATION"
        | "RATE_LIMITED"
        | "ALREADY_STARTED"
        | "SLOT_TAKEN"
        | "SAME_START"
        | "SERVICE_INACTIVE"
        | "DB_ERROR";
      message: string;
    };

type RescheduleContext = {
  booking: {
    id: string;
    business_id: string;
    status: string;
    start_at: string;
    duration_minutes_snapshot: number;
  };
  business: {
    id: string;
    is_active: boolean;
    slot_interval_minutes: number;
    min_notice_minutes: number;
    booking_window_days: number;
    plan: Plan;
    timezone: string;
  };
};

const REJECTED: PublicRescheduleState = {
  status: "error",
  code: "INVALID_TOKEN",
  message: "Não foi possível remarcar esta reserva.",
};

const SLOT_TAKEN: PublicRescheduleState = {
  status: "error",
  code: "SLOT_TAKEN",
  message: "Esse horário não está mais disponível. Escolha outro.",
};

// The booking the capability points to, or null for any mismatch: like the
// cancellation, a wrong code or token never says which part failed.
async function loadContext(admin: ServerClient, code: string, token: string): Promise<RescheduleContext | null> {
  const { data: booking } = await admin
    .from("bookings")
    .select("id, business_id, status, start_at, duration_minutes_snapshot")
    .eq("public_code", code)
    .eq("cancel_token_hash", hashCancelToken(token))
    .maybeSingle();
  if (!booking) return null;

  const { data: business } = await admin
    .from("businesses")
    .select("id, is_active, slot_interval_minutes, min_notice_minutes, booking_window_days, plan, timezone")
    .eq("id", booking.business_id)
    .maybeSingle();
  return business ? { booking, business } : null;
}

function publicRules(business: RescheduleContext["business"]) {
  return {
    slotIntervalMinutes: business.slot_interval_minutes,
    minNoticeMinutes: business.min_notice_minutes,
    bookingWindowDays: getEffectiveBookingWindowDays(business.plan, business.booking_window_days),
    timezone: business.timezone,
  };
}

// null when a read failed: like createBooking, a failure must never read as an
// empty agenda, or the move could skip a bloqueio or another reserva.
async function freeSlots(admin: ServerClient, context: RescheduleContext, date: string): Promise<string[] | null> {
  const { booking, business } = context;
  const rules = publicRules(business);
  if (!isWithinWindow(date, rules, new Date())) return [];

  const day = localDayRangeUtc(date, business.timezone);
  const [faixas, blocks, bookings] = await Promise.all([
    admin
      .from("availability")
      .select("start_time, end_time")
      .eq("business_id", business.id)
      .eq("weekday", weekdayOf(date, business.timezone))
      .eq("is_active", true),
    admin
      .from("availability_blocks")
      .select("start_at, end_at")
      .eq("business_id", business.id)
      .lt("start_at", day.end)
      .gt("end_at", day.start),
    admin
      .from("bookings")
      .select("start_at, end_at")
      .eq("business_id", business.id)
      .neq("status", "cancelled")
      .neq("id", booking.id)
      .lt("start_at", day.end)
      .gt("end_at", day.start),
  ]);
  if (faixas.error || blocks.error || bookings.error) return null;

  const slots = computeAvailableSlots({
    intervals: (faixas.data ?? []).map((f) => ({ startTime: f.start_time, endTime: f.end_time })),
    rules,
    durationMinutes: booking.duration_minutes_snapshot,
    date,
    now: new Date(),
    blocks: (blocks.data ?? []).map((b) => toUtcRange(b.start_at, b.end_at)),
    occupancies: (bookings.data ?? []).map((b) => toUtcRange(b.start_at, b.end_at)),
  });
  // The current horário is not a move.
  const current = Date.parse(booking.start_at);
  return slots.filter((slot) => Date.parse(zonedTimeToUtc(date, slot, business.timezone)) !== current);
}

function isReschedulable(context: RescheduleContext): boolean {
  return context.booking.status === "confirmed" && context.business.is_active;
}

export async function getPublicRescheduleSlots(
  code: string,
  token: string,
  date: string,
): Promise<{ available: string[]; error?: "rejected" | "validation" | "rate_limited" | "db_error" }> {
  const parsedCode = publicCodeSchema.safeParse(code);
  if (!parsedCode.success || !isValidCancelToken(token)) return { available: [], error: "rejected" };
  if (!publicSlotSchema.shape.date.safeParse(date).success) return { available: [], error: "validation" };

  const admin = createAdminClient();
  const context = await loadContext(admin, parsedCode.data, token);
  if (!context || !isReschedulable(context)) return { available: [], error: "rejected" };

  // The digest lookup above is no oracle (256-bit capability); the privileged
  // agenda reads below share the public page's availability budget.
  let allowed: boolean;
  try {
    allowed = await enforceAvailabilityRateLimit(admin, await getClientIp(), context.business.id);
  } catch {
    allowed = false;
  }
  if (!allowed) return { available: [], error: "rate_limited" };

  const available = await freeSlots(admin, context, date);
  return available ? { available } : { available: [], error: "db_error" };
}

export async function reschedulePublicBooking(
  _prev: PublicRescheduleState,
  formData: FormData,
): Promise<PublicRescheduleState> {
  const code = String(formData.get("code") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const slot = publicSlotSchema.safeParse({
    date: String(formData.get("date") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
  });

  const parsedCode = publicCodeSchema.safeParse(code);
  if (!parsedCode.success || !isValidCancelToken(token)) return REJECTED;
  if (!slot.success) {
    return { status: "error", code: "VALIDATION", message: "Escolha a nova data e o novo horário." };
  }

  const admin = createAdminClient();
  let allowed: boolean;
  try {
    allowed = await enforceConsultRateLimit(admin, await getClientIp());
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return {
      status: "error",
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    };
  }

  const context = await loadContext(admin, parsedCode.data, token);
  if (!context || !isReschedulable(context)) return REJECTED;
  if (Date.parse(context.booking.start_at) <= Date.now()) {
    return { status: "error", code: "ALREADY_STARTED", message: BOOKING_ALREADY_STARTED_MESSAGE };
  }

  const { date, startTime } = slot.data;
  if (!localTimeExists(date, startTime, context.business.timezone)) return SLOT_TAKEN;
  const available = await freeSlots(admin, context, date);
  if (available === null) {
    return { status: "error", code: "DB_ERROR", message: "Não foi possível verificar a disponibilidade. Tente novamente." };
  }
  if (!available.includes(startTime)) return SLOT_TAKEN;

  const startAt = zonedTimeToUtc(date, startTime, context.business.timezone);
  const { data: moved, error } = await admin.rpc("reschedule_booking_by_public_code", {
    p_code: parsedCode.data,
    p_cancel_token_hash: hashCancelToken(token),
    p_start_at: startAt,
  });
  if (error || !moved) return rpcErrorState(error);

  try {
    await syncGoogleCalendarBooking(moved.business_id, moved.id);
  } catch (syncError) {
    console.error("google_calendar_booking_sync_failed", {
      bookingId: moved.id,
      reason: syncError instanceof Error ? syncError.message : "unknown",
    });
  }

  await notifyReschedule(admin, moved, context.booking.start_at);
  return { status: "done", startAt: moved.start_at };
}

// E-mails the cliente (when the reserva has an e-mail) and tells the dono
// (#146). Best effort: no failure here ever undoes the remarcação.
async function notifyReschedule(
  admin: ServerClient,
  moved: Database["public"]["Tables"]["bookings"]["Row"],
  previousStartAt: string,
): Promise<void> {
  const logFailure = (reason: string) =>
    console.error("booking_reschedule_email_failed", { bookingId: moved.id, reason });

  try {
    const { data: business } = await admin
      .from("businesses")
      .select("name, slug, timezone, owner_id, phone")
      .eq("id", moved.business_id)
      .maybeSingle();
    if (!business) return logFailure("business_not_found");

    const customerEmail = moved.customer_email_snapshot;
    const [emailResult] = await Promise.all([
      customerEmail
        ? sendCustomerRescheduledEmail({
            customerName: moved.customer_name_snapshot,
            customerEmail,
            businessName: business.name,
            serviceName: moved.service_name_snapshot,
            previousStartAt,
            startAt: moved.start_at,
            timezone: business.timezone,
            publicCode: moved.public_code,
            bookingUrl: buildPublicConfirmationUrl(resolveAppOrigin(), business.slug, moved.public_code),
            businessPhone: business.phone,
          })
        : null,
      notifyOwner(admin, "customer_rescheduled", {
        bookingId: moved.id,
        ownerId: business.owner_id,
        businessName: business.name,
        customerName: moved.customer_name_snapshot,
        customerPhone: moved.customer_phone_snapshot,
        serviceName: moved.service_name_snapshot,
        startAt: moved.start_at,
        timezone: business.timezone,
        publicCode: moved.public_code,
        previousStartAt,
      }),
    ]);
    if (emailResult && !emailResult.sent) logFailure(emailResult.reason);
  } catch {
    logFailure("unexpected_error");
  }
}

function rpcErrorState(error: { message?: string; code?: string } | null): PublicRescheduleState {
  const message = String(error?.message ?? "");
  // Only reached with a valid capability, so it reveals nothing new (#141).
  if (/BOOKING_ALREADY_STARTED/.test(message)) {
    return { status: "error", code: "ALREADY_STARTED", message: BOOKING_ALREADY_STARTED_MESSAGE };
  }
  if (/BOOKING_SAME_START/.test(message)) {
    return { status: "error", code: "SAME_START", message: "Sua reserva já está nesse horário. Escolha outro." };
  }
  if (/SERVICE_INACTIVE/.test(message)) {
    return {
      status: "error",
      code: "SERVICE_INACTIVE",
      message: "Este serviço não está mais disponível para remarcação. Fale com o negócio.",
    };
  }
  if (
    /BOOKING_BEFORE_MIN_NOTICE|BOOKING_OUTSIDE_PLAN_WINDOW|BOOKING_BLOCK_OVERLAP|bookings_no_overlap/.test(message) ||
    error?.code === "23P01"
  ) {
    return SLOT_TAKEN;
  }
  if (/RESCHEDULE_REJECTED|BUSINESS_INACTIVE/.test(message)) return REJECTED;
  return { status: "error", code: "DB_ERROR", message: "Não foi possível remarcar a reserva. Tente novamente." };
}

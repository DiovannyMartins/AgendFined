import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { BOOKING_WINDOW_LIMIT_DAYS } from "@/lib/plan/access";
import {
  computeAvailableSlots,
  isWithinWindow,
  localDayRangeUtc,
  localTimeExists,
  toUtcRange,
  weekdayOf,
  zonedTimeToUtc,
} from "@/lib/booking/availability";
import { bookingsOutsideAvailability } from "@/lib/availability/outside-bookings";

// Rules the dono books and reschedules with in the painel (#193, #194): the
// slots of the public page, without the antecedência and with the plan limit
// (365 days) as the janela. Shared by the reserva pelo painel and the remarcação.

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type OwnerBusiness = {
  id: string;
  slot_interval_minutes: number;
};

export function ownerRules(business: Pick<OwnerBusiness, "slot_interval_minutes">, timezone: string) {
  return {
    slotIntervalMinutes: business.slot_interval_minutes,
    minNoticeMinutes: 0,
    bookingWindowDays: BOOKING_WINDOW_LIMIT_DAYS,
    timezone,
  };
}

export type OwnerStart =
  | { ok: true; startAt: string }
  | { ok: false; code: "validation" | "past" | "booking_window"; message: string; fieldErrors?: Record<string, string[]> };

// The horário the dono typed, as a UTC instant, once it exists, is in the
// future and fits the janela of the plan (365 days).
export function resolveOwnerStart(
  date: string,
  startTime: string,
  business: Pick<OwnerBusiness, "slot_interval_minutes">,
  timezone: string,
  now: Date,
): OwnerStart {
  // A horário inside the horário de verão gap would be stored as another
  // instant than the one the dono typed (#190).
  if (!localTimeExists(date, startTime, timezone)) {
    return {
      ok: false,
      code: "validation",
      message: "Esse horário não existe nesse dia por causa do horário de verão. Escolha outro.",
      fieldErrors: { startTime: ["Horário inexistente nesse dia."] },
    };
  }
  const startAt = zonedTimeToUtc(date, startTime, timezone);
  if (Date.parse(startAt) <= now.getTime()) {
    return { ok: false, code: "past", message: "Esse horário já passou. Escolha um horário no futuro." };
  }
  if (!isWithinWindow(date, ownerRules(business, timezone), now)) {
    return {
      ok: false,
      code: "booking_window",
      message: `O Plano AgendFined permite reservas até ${BOOKING_WINDOW_LIMIT_DAYS} dias à frente.`,
    };
  }
  return { ok: true, startAt };
}

// Whether [startAt, startAt + duration) falls outside the faixas, which the dono
// must confirm as an encaixe. null when the faixas could not be read.
export async function isOutsideAvailability(
  supabase: ServerClient,
  businessId: string,
  timezone: string,
  startAt: string,
  durationMinutes: number,
): Promise<boolean | null> {
  const { data: faixas, error } = await supabase
    .from("availability")
    .select("weekday, start_time, end_time")
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (error) return null;
  const endAt = new Date(Date.parse(startAt) + durationMinutes * 60_000).toISOString();
  const candidate = { customer_name_snapshot: "", start_at: startAt, end_at: endAt };
  return bookingsOutsideAvailability([candidate], faixas ?? [], timezone).length > 0;
}

// Free horários of a day. A remarcação leaves its own reserva out of the
// occupied ones, so it can move inside its current range, and drops its
// current horário, which is not a move.
export async function listOwnerFreeSlots(
  supabase: ServerClient,
  business: OwnerBusiness,
  timezone: string,
  input: { date: string; durationMinutes: number; rescheduling?: { id: string; startAt: string } },
): Promise<string[] | null> {
  const day = localDayRangeUtc(input.date, timezone);
  let occupied = supabase
    .from("bookings")
    .select("start_at, end_at")
    .eq("business_id", business.id)
    .neq("status", "cancelled")
    .lt("start_at", day.end)
    .gt("end_at", day.start);
  if (input.rescheduling) occupied = occupied.neq("id", input.rescheduling.id);

  const [faixas, blocks, bookings] = await Promise.all([
    supabase
      .from("availability")
      .select("start_time, end_time")
      .eq("business_id", business.id)
      .eq("weekday", weekdayOf(input.date, timezone))
      .eq("is_active", true),
    supabase
      .from("availability_blocks")
      .select("start_at, end_at")
      .eq("business_id", business.id)
      .lt("start_at", day.end)
      .gt("end_at", day.start),
    occupied,
  ]);
  if (faixas.error || blocks.error || bookings.error) return null;

  const slots = computeAvailableSlots({
    intervals: (faixas.data ?? []).map((f) => ({ startTime: f.start_time, endTime: f.end_time })),
    rules: ownerRules(business, timezone),
    durationMinutes: input.durationMinutes,
    date: input.date,
    now: new Date(),
    blocks: (blocks.data ?? []).map((b) => toUtcRange(b.start_at, b.end_at)),
    occupancies: (bookings.data ?? []).map((b) => toUtcRange(b.start_at, b.end_at)),
  });
  if (!input.rescheduling) return slots;
  const current = Date.parse(input.rescheduling.startAt);
  return slots.filter((slot) => Date.parse(zonedTimeToUtc(input.date, slot, timezone)) !== current);
}

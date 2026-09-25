"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { availabilitySchema, publicAvailabilitySchema } from "@/lib/validation/schemas";
import { getCurrentBusiness } from "@/lib/business/queries";
import { getEffectiveBookingWindowDays } from "@/lib/plan/plan";
import type { ActionResult } from "@/lib/business/actions";
import { computeAvailableSlots, isWithinWindow, localDayRangeUtc, overlaps, toUtcRange, weekdayOf } from "@/lib/booking/availability";
import type { UtcRange } from "@/lib/booking/availability";
import { enforceAvailabilityRateLimit, getClientIp } from "@/lib/booking/rate-limit";

export type { ActionResult };

export async function setAvailability(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");

  const parsed = availabilitySchema.safeParse({ weekday, startTime, endTime });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Revise os campos de disponibilidade.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const supabase = await createClient();

  // §9.3: same business + day ranges must not overlap (agenda is per business).
  const { data: existing } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .eq("weekday", parsed.data.weekday)
    .eq("is_active", true);

  for (const row of existing ?? []) {
    if (overlaps({ start: row.start_time, end: row.end_time }, { start: startTime, end: endTime })) {
      return {
        ok: false,
        code: "OVERLAP",
        message: "Este intervalo se sobrepõe a um já existente neste dia.",
      };
    }
  }

  const { error } = await supabase.from("availability").insert({
    business_id: business.id,
    weekday: parsed.data.weekday,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
  });

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar." };

  revalidatePath("/dashboard/bloqueios");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: undefined };
}

export async function updateAvailability(
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");

  const parsed = availabilitySchema.safeParse({ weekday, startTime, endTime });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Revise os campos de disponibilidade.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const supabase = await createClient();

  // §9.3: same business + day ranges must not overlap (agenda is per business).
  // Exclude the row being edited so saving without changes always succeeds.
  const { data: existing } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .eq("weekday", parsed.data.weekday)
    .eq("is_active", true)
    .neq("id", id);

  for (const row of existing ?? []) {
    if (overlaps({ start: row.start_time, end: row.end_time }, { start: startTime, end: endTime })) {
      return {
        ok: false,
        code: "OVERLAP",
        message: "Este intervalo se sobrepõe a um já existente neste dia.",
      };
    }
  }

  const { error } = await supabase
    .from("availability")
    .update({
      weekday: parsed.data.weekday,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
    })
    .eq("id", id)
    .eq("business_id", business.id);

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar." };

  revalidatePath("/dashboard/bloqueios");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: undefined };
}

export async function deleteAvailability(id: string): Promise<ActionResult> {
  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("availability")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id)
    .select("id");
  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível excluir o horário." };
  if (!data?.length) return { ok: false, code: "NOT_FOUND", message: "Horário não encontrado." };
  revalidatePath("/dashboard/bloqueios");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: undefined };
}

export async function createBlock(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const startAt = String(formData.get("startAt") ?? "");
  const endAt = String(formData.get("endAt") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!startAt || !endAt) {
    return { ok: false, code: "VALIDATION", message: "Informe o início e o fim do bloqueio." };
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return { ok: false, code: "VALIDATION", message: "O fim deve ser depois do início." };
  }

  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const supabase = await createClient();

  // §9.4: cannot create a block overlapping a future active booking of the same
  // business.
  const { data: conflicting } = await supabase
    .from("bookings")
    .select("id, customer_name_snapshot, start_at, end_at")
    .eq("business_id", business.id)
    .neq("status", "cancelled")
    .gt("end_at", startAt)
    .lt("start_at", endAt);

  if (conflicting && conflicting.length > 0) {
    const names = conflicting.map((b) => b.customer_name_snapshot).join(", ");
    return {
      ok: false,
      code: "BOOKING_CONFLICT",
      message: `Bloqueio conflita com reserva(s) futura(s): ${names}. Cancele/reagende antes.`,
    };
  }

  const { error } = await supabase.from("availability_blocks").insert({
    business_id: business.id,
    start_at: startAt,
    end_at: endAt,
    reason,
  });

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar o bloqueio." };

  revalidatePath("/dashboard/bloqueios");
  return { ok: true, data: undefined };
}

export async function deleteBlock(id: string): Promise<ActionResult> {
  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("availability_blocks")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id)
    .select("id");
  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível excluir o bloqueio." };
  if (!data?.length) return { ok: false, code: "NOT_FOUND", message: "Bloqueio não encontrado." };
  revalidatePath("/dashboard/bloqueios");
  return { ok: true, data: undefined };
}

export async function getSlotsForDate(
  businessId: string,
  serviceId: string,
  date: string,
): Promise<{ available: string[]; error?: string }> {
  const parsed = publicAvailabilitySchema.safeParse({ businessId, serviceId, date });
  if (!parsed.success) return { available: [], error: "validation" };

  // Public booking flow reads blocks and bookings of any business; anonymous RLS
  // would block that, so we use the server-only admin client for these reads.
  const supabase = createAdminClient();
  let allowed: boolean;
  try {
    allowed = await enforceAvailabilityRateLimit(supabase, await getClientIp(), businessId);
  } catch {
    // A failed limiter must fail closed: otherwise the privileged reads below
    // become an unauthenticated high-volume database oracle.
    return { available: [], error: "rate_limited" };
  }
  if (!allowed) return { available: [], error: "rate_limited" };

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, is_active, slot_interval_minutes, min_notice_minutes, booking_window_days, plan")
    .eq("id", businessId)
    .single();

  if (businessError) return { available: [], error: "db_error" };
  if (!business || !business.is_active) return { available: [], error: "not_found" };

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .eq("business_id", businessId)
    .eq("is_active", true)
    .single();

  if (serviceError) return { available: [], error: "db_error" };
  if (!service) return { available: [], error: "service_not_found" };

  const rules = {
    slotIntervalMinutes: business.slot_interval_minutes,
    minNoticeMinutes: business.min_notice_minutes,
    bookingWindowDays: getEffectiveBookingWindowDays(business.plan, business.booking_window_days),
  };
  if (!isWithinWindow(date, rules, new Date())) return { available: [], error: "booking_window" };

  // §10.2: interpret "now" and the requested date no fuso da aplicação.
  const weekday = weekdayOf(date);

  // Availability, blocks and occupied slots are resolved for the business only.
  const { data: intervals, error: intervalsError } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("business_id", businessId)
    .eq("weekday", weekday)
    .eq("is_active", true);

  if (intervalsError) return { available: [], error: "db_error" };

  const day = localDayRangeUtc(date);

  const [{ data: blocks, error: blocksError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("availability_blocks")
      .select("start_at, end_at")
      .eq("business_id", businessId)
      .lt("start_at", day.end)
      .gt("end_at", day.start),
    supabase
      .from("bookings")
      .select("start_at, end_at")
      .eq("business_id", businessId)
      .neq("status", "cancelled")
      .lt("start_at", day.end)
      .gt("end_at", day.start),
  ]);

  if (blocksError || bookingsError) return { available: [], error: "db_error" };

  // Blocks/bookings are read in UTC; computeAvailableSlots resolves each local
  // candidate to UTC before overlap checking (fixes midnight-crossing blocks).
  const occupancies: UtcRange[] = (bookings ?? []).map((b) => toUtcRange(b.start_at, b.end_at));

  const blockRanges: UtcRange[] = (blocks ?? []).map((b) => toUtcRange(b.start_at, b.end_at));

  const available = computeAvailableSlots({
    intervals: (intervals ?? []).map((i) => ({ startTime: i.start_time, endTime: i.end_time })),
    rules,
    durationMinutes: service.duration_minutes,
    date,
    now: new Date(),
    blocks: blockRanges,
    occupancies,
  });

  return { available };
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { publicAvailabilitySchema } from "@/lib/validation/schemas";
import { getEffectiveBookingWindowDays } from "@/lib/plan/plan";
import { computeAvailableSlots, isWithinWindow, localDayRangeUtc, toUtcRange, weekdayOf } from "@/lib/booking/availability";
import type { UtcRange } from "@/lib/booking/availability";
import { enforceAvailabilityRateLimit } from "@/lib/booking/rate-limit";

export type PublicSlotsError =
  | "validation"
  | "rate_limited"
  | "db_error"
  | "not_found"
  | "service_not_found"
  | "booking_window";

// The body is an allowlist: only the free slots and, on failure, the code.
export type PublicSlotsResult = { available: string[]; error?: PublicSlotsError };

// Free slots of a serviço on a local date, for the public page. Served by
// GET /api/public/slots (#216).
export async function getPublicSlots(
  input: { businessId: unknown; serviceId: unknown; date: unknown },
  ip: string,
): Promise<PublicSlotsResult> {
  const parsed = publicAvailabilitySchema.safeParse(input);
  if (!parsed.success) return { available: [], error: "validation" };
  const { businessId, serviceId, date } = parsed.data;

  // Public booking flow reads blocks and bookings of any business; anonymous RLS
  // would block that, so we use the server-only admin client for these reads.
  const supabase = createAdminClient();
  let allowed: boolean;
  try {
    allowed = await enforceAvailabilityRateLimit(supabase, ip, businessId);
  } catch {
    // A failed limiter must fail closed: otherwise the privileged reads below
    // become an unauthenticated high-volume database oracle.
    return { available: [], error: "rate_limited" };
  }
  if (!allowed) return { available: [], error: "rate_limited" };

  // The faixas of every weekday are read with the negócio and the serviço (a
  // handful of rows), so the weekday can be picked once the timezone is known.
  const [
    { data: business, error: businessError },
    { data: service, error: serviceError },
    { data: faixas, error: faixasError },
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, is_active, slot_interval_minutes, min_notice_minutes, booking_window_days, plan, timezone")
      .eq("id", businessId)
      .maybeSingle(),
    supabase
      .from("services")
      .select("duration_minutes")
      .eq("id", serviceId)
      .eq("business_id", businessId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("availability")
      .select("weekday, start_time, end_time")
      .eq("business_id", businessId)
      .eq("is_active", true),
  ]);

  // maybeSingle: a missing row is "not found", only a real failure is db_error.
  if (businessError) return { available: [], error: "db_error" };
  if (!business || !business.is_active) return { available: [], error: "not_found" };
  if (serviceError) return { available: [], error: "db_error" };
  if (!service) return { available: [], error: "service_not_found" };

  const rules = {
    slotIntervalMinutes: business.slot_interval_minutes,
    minNoticeMinutes: business.min_notice_minutes,
    bookingWindowDays: getEffectiveBookingWindowDays(business.plan, business.booking_window_days),
    timezone: business.timezone,
  };
  if (!isWithinWindow(date, rules, new Date())) return { available: [], error: "booking_window" };
  if (faixasError) return { available: [], error: "db_error" };

  // §10.2: interpret "now" and the requested date in the business timezone.
  const weekday = weekdayOf(date, business.timezone);
  const intervals = (faixas ?? []).filter((f) => f.weekday === weekday);

  const day = localDayRangeUtc(date, business.timezone);

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
    intervals: intervals.map((i) => ({ startTime: i.start_time, endTime: i.end_time })),
    rules,
    durationMinutes: service.duration_minutes,
    date,
    now: new Date(),
    blocks: blockRanges,
    occupancies,
  });

  return { available };
}

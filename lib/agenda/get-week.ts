// The agenda page's read boundary (#215): one week of reservas, by the
// business timezone, through the caller's user-scoped client (RLS). Kept apart
// from the page so the integration tests run the same query.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database-types";
import {
  AGENDA_BOOKING_COLUMNS,
  agendaWeek,
  toAgendaBooking,
  type AgendaBooking,
  type AgendaBookingRow,
} from "@/lib/agenda/view";

export async function fetchAgendaWeek(
  supabase: SupabaseClient<Database>,
  businessId: string,
  dateKey: string,
  timezone: string,
): Promise<{ days: string[]; bookings: AgendaBooking[] }> {
  const week = agendaWeek(dateKey, timezone);
  const { data, error } = await supabase
    .from("bookings")
    .select(AGENDA_BOOKING_COLUMNS)
    .eq("business_id", businessId)
    .gte("start_at", week.from)
    .lt("start_at", week.to)
    .order("start_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return { days: week.days, bookings: ((data ?? []) as AgendaBookingRow[]).map(toAgendaBooking) };
}

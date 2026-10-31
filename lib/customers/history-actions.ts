"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { toCustomerBooking, type CustomerBooking } from "@/lib/customers/history";

const HISTORY_LIMIT = 100;

// The reservas of one cliente, loaded when the dono opens their history
// instead of shipping every reserva of every cliente with the page (#215).
// The user-scoped client keeps RLS in charge; the business filter keeps the
// answer to the dono's own negócio. Null on any failure.
export async function loadCustomerBookings(customerId: string): Promise<CustomerBooking[] | null> {
  const parsed = z.string().uuid().safeParse(customerId);
  if (!parsed.success) return null;

  const business = await getCurrentBusiness();
  if (!business) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, customer_id, start_at, status, service_name_snapshot, duration_minutes_snapshot")
    .eq("business_id", business.id)
    .eq("customer_id", parsed.data)
    .order("start_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) return null;
  return (data ?? []).map(toCustomerBooking);
}

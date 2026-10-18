// Whether a negócio can take reservas online: it needs at least one active
// serviço and one active faixa of disponibilidade recorrente. Bloqueios and the
// booking window only narrow the slots; they never make the page "not ready".
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database-types";

export type BookingReadiness = {
  hasActiveService: boolean;
  hasAvailability: boolean;
};

// A failed lookup counts as configured: the page keeps its regular flow (the
// server still validates every slot) instead of claiming the negócio is closed.
async function hasActiveRow(
  client: SupabaseClient<Database>,
  table: "services" | "availability",
  businessId: string,
): Promise<boolean> {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (error) return true;
  return (count ?? 0) > 0;
}

export function hasActiveAvailability(client: SupabaseClient<Database>, businessId: string): Promise<boolean> {
  return hasActiveRow(client, "availability", businessId);
}

export async function getBookingReadiness(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<BookingReadiness> {
  const [hasActiveService, hasAvailability] = await Promise.all([
    hasActiveRow(client, "services", businessId),
    hasActiveRow(client, "availability", businessId),
  ]);
  return { hasActiveService, hasAvailability };
}

import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database-types";

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
};

export type PublicBookingPage = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  searchIndexingEnabled: boolean;
  // business_has_access() (ADR 0013): a suspended negócio keeps its page, without
  // slots or lista de espera. Why it is suspended never reaches the page.
  acceptsBookings: boolean;
  bookingWindowDays: number;
  hasAvailability: boolean;
  // Only present when the negócio cannot take reservas online.
  phone: string | null;
  services: PublicService[];
};

// Everything /[slug] shows, in one RPC (ADR 0006). Wrapped in React.cache so
// generateMetadata and the page share one call per request. Returns null for a
// slug that is not an active negócio; a failed lookup throws.
export const getPublicBookingPage = cache(async (slug: string): Promise<PublicBookingPage | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_booking_page", { p_slug: slug });
  if (error) throw new Error("PUBLIC_BUSINESS_LOOKUP_FAILED");
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    timezone: row.timezone,
    searchIndexingEnabled: row.search_indexing_enabled,
    acceptsBookings: row.accepts_bookings,
    bookingWindowDays: row.booking_window_days,
    hasAvailability: row.has_availability,
    phone: row.phone,
    services: toServices(row.services),
  };
});

function toServices(value: Json): PublicService[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const s = item as { id: string; name: string; description: string | null; duration_minutes: number; price_cents: number };
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.duration_minutes,
      priceCents: s.price_cents,
    };
  });
}

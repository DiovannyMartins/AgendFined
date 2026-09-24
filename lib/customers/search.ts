"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { buildCustomerHistory } from "@/lib/customers/history";
import { enforceCustomerSearchRateLimit, getClientIp } from "@/lib/booking/rate-limit";
import { z } from "zod";

export async function semanticSearchCustomers(
  query: string,
): Promise<{ ids: string[]; confidence: number } | null> {
  const parsedQuery = z.string().trim().min(1).max(100).safeParse(query);
  if (!parsedQuery.success) return null;
  const boundedQuery = parsedQuery.data;

  const business = await getCurrentBusiness();
  if (!business) return null;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  try {
    const allowed = await enforceCustomerSearchRateLimit(admin, await getClientIp(), business.id);
    if (!allowed) return null;
  } catch {
    return null;
  }

  const supabase = await createClient();
  const [{ data: customers, error: customersError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, email")
      .eq("business_id", business.id)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("bookings")
      .select("id, customer_id, start_at, status, service_name_snapshot, duration_minutes_snapshot")
      .eq("business_id", business.id)
      .order("start_at", { ascending: false })
      .limit(2_000),
  ]);
  if (customersError || bookingsError) return null;

  const history = buildCustomerHistory(customers ?? [], bookings ?? []);
  const normalizedQuery = normalize(boundedQuery);
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length >= 2);
  if (tokens.length === 0) return null;

  const matches = history.filter(({ customer, bookings: customerBookings }) => {
    const searchable = normalize([
      customer.name,
      customer.phone,
      customer.email ?? "",
      ...customerBookings.flatMap((booking) => [booking.service_name_snapshot, booking.status]),
    ].join(" "));
    return searchable.includes(normalizedQuery) || tokens.some((token) => searchable.includes(token));
  });

  return {
    ids: matches.map(({ customer }) => customer.id),
    confidence: matches.length > 0 ? 1 : 0,
  };
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@+._-]+/g, " ")
    .trim();
}

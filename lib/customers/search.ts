"use server";

import { matchCustomersToQuery } from "@/lib/typesafe/judgments";
import type { CustomerHistory } from "@/lib/customers/history";

export async function semanticSearchCustomers(
  history: CustomerHistory[],
  query: string,
): Promise<{ ids: string[]; confidence: number } | null> {
  const boundedQuery = query.trim();
  if (!boundedQuery || boundedQuery.length > 100 || history.length > 100) return null;
  return matchCustomersToQuery(
    boundedQuery,
    history.slice(0, 100).map(({ customer, bookings }) => ({
      id: customer.id,
      name: customer.name.slice(0, 100),
      bookings: bookings.slice(0, 20).map((booking) => ({
        serviceName: booking.service_name_snapshot,
        status: booking.status,
        startAt: booking.start_at,
      })),
    })),
  );
}

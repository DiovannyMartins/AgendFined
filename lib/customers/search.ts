"use server";

import { matchCustomersToQuery } from "@/lib/typesafe/judgments";
import type { CustomerHistory } from "@/lib/customers/history";

export async function semanticSearchCustomers(
  history: CustomerHistory[],
  query: string,
): Promise<{ ids: string[]; confidence: number } | null> {
  return matchCustomersToQuery(
    query,
    history.map(({ customer, bookings }) => ({
      id: customer.id,
      name: customer.name,
      bookings: bookings.map((booking) => ({
        serviceName: booking.service_name_snapshot,
        status: booking.status,
        startAt: booking.start_at,
      })),
    })),
  );
}

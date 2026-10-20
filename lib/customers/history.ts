// Client history seam (INC-1). `customers` is the source of truth for who the
// business has served, deduplicated by `business_id + phone` (the DB unique
// constraint keeps one row per person per business). `buildCustomerHistory`
// groups the business's bookings under the customer they belong to. It is pure
// and injected-fetch-free so it can be unit-tested without a database.
import { matchesPhone } from "@/lib/format/phone";
import type { BookingStatus } from "@/lib/bookings/transitions";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
};

export type CustomerBooking = {
  id: string;
  customer_id: string;
  start_at: string;
  status: BookingStatus;
  service_name_snapshot: string;
  duration_minutes_snapshot: number;
};

export type CustomerHistory = {
  customer: CustomerRow;
  // Bookings sorted most-recent-first (callers render a timeline).
  bookings: CustomerBooking[];
};

// Group bookings under customers and sort each customer's bookings newest-first.
export function buildCustomerHistory(
  customers: CustomerRow[],
  bookings: CustomerBooking[],
): CustomerHistory[] {
  const byCustomer = new Map<string, CustomerBooking[]>();
  for (const booking of bookings) {
    const list = byCustomer.get(booking.customer_id) ?? [];
    list.push(booking);
    byCustomer.set(booking.customer_id, list);
  }

  return customers.map((customer) => {
    const list = (byCustomer.get(customer.id) ?? []).slice().sort((a, b) =>
      b.start_at.localeCompare(a.start_at),
    );
    return { customer, bookings: list };
  });
}

// Case-insensitive search across name, phone and email. Empty query matches all.
export function filterCustomers(customers: CustomerRow[], query: string): CustomerRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  return customers.filter((c) =>
    matchesPhone(c.phone, q) ||
    [c.name, c.phone, c.email ?? ""].some((value) => value.toLowerCase().includes(q)),
  );
}

// Search behind "buscar também pelo histórico de reservas": name, phone, email
// and the services/statuses of the customer's bookings. A query shaped like a
// phone ("(11) 98888-7777") is compared digit-by-digit against the phone only,
// so the DDD alone doesn't match every customer. Otherwise every word of the
// query must appear (AND), so "Cliente Beta" doesn't bring all "cliente"s.
// Returns null when the query has nothing searchable (no word of 2+ letters).
export function searchCustomerHistory(history: CustomerHistory[], query: string): CustomerHistory[] | null {
  if (/\d/.test(query) && matchesPhoneShape(query)) {
    return history.filter(({ customer }) => matchesPhone(customer.phone, query));
  }

  const tokens = normalizeSearchText(query).split(" ").filter((token) => token.length >= 2);
  if (tokens.length === 0) return null;

  return history.filter(({ customer, bookings }) => {
    const searchable = normalizeSearchText([
      customer.name,
      customer.phone,
      customer.email ?? "",
      ...bookings.flatMap((booking) => [booking.service_name_snapshot, booking.status]),
    ].join(" "));
    return tokens.every((token) => searchable.includes(token) || matchesPhone(customer.phone, token));
  });
}

function matchesPhoneShape(query: string): boolean {
  return /^[\d\s().+-]+$/.test(query.trim());
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@+._-]+/g, " ")
    .trim();
}

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

// One row of the paginated Clientes list (#215): explicit keys, the reservas
// counted by the database, the history itself loaded only when opened.
export type CustomerSummary = CustomerRow & { booking_count: number };

export const CUSTOMER_PAGE_SIZE = 50;

// New objects with only the allowlisted keys: a `select("*")` row passed by
// reference sent tokens, notes and snapshots to the browser (#215).
export function toCustomerRow(row: CustomerRow): CustomerRow {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email };
}

export function toCustomerSummary(row: CustomerRow, bookingCount: number): CustomerSummary {
  return { ...toCustomerRow(row), booking_count: bookingCount };
}

export function toCustomerBooking(row: CustomerBooking): CustomerBooking {
  return {
    id: row.id,
    customer_id: row.customer_id,
    start_at: row.start_at,
    status: row.status,
    service_name_snapshot: row.service_name_snapshot,
    duration_minutes_snapshot: row.duration_minutes_snapshot,
  };
}

// The Clientes search typed in the box, as a PostgREST `or` filter over name,
// e-mail and phone digits. Characters that carry meaning in the filter syntax
// (commas, parentheses, quotes, wildcards) are dropped, so input can't add
// conditions. Null when nothing searchable is left.
export function customerSearchFilter(query: string): string | null {
  const text = query.normalize("NFC").replace(/[^\p{L}\p{N}@._+\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!text) return null;
  const conditions = [`name.ilike.*${text}*`, `email.ilike.*${text}*`];
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 3) conditions.push(`phone.ilike.*${digits}*`);
  return conditions.join(",");
}

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
    const list = (byCustomer.get(customer.id) ?? []).map(toCustomerBooking).sort((a, b) =>
      b.start_at.localeCompare(a.start_at),
    );
    return { customer: toCustomerRow(customer), bookings: list };
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

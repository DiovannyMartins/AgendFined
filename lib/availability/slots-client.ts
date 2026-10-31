import type { PublicSlotsResult } from "@/lib/availability/public-slots";

// Reads the free slots from GET /api/public/slots. Error statuses still carry
// the { available, error } body; the caller passes a signal to abort a lookup
// made stale by a new date or serviço (rejects with an AbortError).
export async function fetchSlots(
  businessId: string,
  serviceId: string,
  date: string,
  signal?: AbortSignal,
): Promise<PublicSlotsResult> {
  const query = new URLSearchParams({ businessId, serviceId, date });
  const response = await fetch(`/api/public/slots?${query}`, { signal, cache: "no-store" });
  const body = (await response.json()) as PublicSlotsResult;
  return { available: body.available ?? [], ...(body.error ? { error: body.error } : {}) };
}

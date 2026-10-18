import { z } from "zod";
import { waitlistSchema, type WaitlistInput } from "@/lib/validation/schemas";

// Waitlist seam (INC-3). A customer who found their preferred slot occupied
// leaves contact details + the desired slot (`service_id`/`start_at`, a UTC
// instant per ADR 0003) so a later opening can be offered. The validation and
// eligibility rules live here as pure functions so they are unit-testable
// without a database; the RPC `join_waitlist` enforces integrity atomically
// inside PostgreSQL (business/service ownership + the dedup unique constraint).

export type WaitlistStatus = "pending" | "notified" | "converted" | "cancelled";

export type WaitlistRow = {
  id: string;
  business_id: string;
  service_id: string;
  start_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  status: WaitlistStatus;
  created_at: string;
};

// A waitlist entry only makes sense for a slot still in the future: once the
// moment passes, there is nothing left to wait for.
export function isWaitlistEligible(startAt: string, now: Date): boolean {
  return new Date(startAt).getTime() > now.getTime();
}

// Validate + normalize the raw form payload before calling the RPC. Mirrors the
// booking server-action posture: reject invalid input server-side even if the
// browser validation was bypassed.
export function parseWaitlistInput(raw: {
  serviceId: string;
  startAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
}):
  | { ok: true; data: WaitlistInput }
  | { ok: false; message: string; fieldErrors: Record<string, string[]> } {
  const parsed = waitlistSchema.safeParse({
    serviceId: raw.serviceId,
    startAt: raw.startAt,
    customerName: raw.customerName,
    customerPhone: raw.customerPhone,
    customerEmail: raw.customerEmail || "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Revise os dados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  return { ok: true, data: parsed.data };
}

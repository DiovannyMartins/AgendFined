import { publicCodeSchema } from "@/lib/validation/schemas";

// A found public booking, normalized to the shape the confirmation/consult
// screen renders. It carries no customer personal data (§16: the public code
// must never authorize access to customer data).
export type PublicBookingLookup = {
  serviceName: string;
  startAt: string;
  endAt: string;
  businessName: string;
  businessSlug: string;
  businessPhone: string;
};

// Row shape returned by the security-definer RPC get_booking_by_public_code.
export type PublicBookingRow = {
  service_name: string;
  start_at: string;
  end_at: string;
  business_name: string;
  business_slug: string;
  business_phone: string;
};

// Fetcher injected at the db boundary so the lookup stays unit-testable.
export type LookupFetcher = (
  code: string,
) => Promise<{ data: PublicBookingRow | null; error: { message?: string } | null }>;

export type LookupResult =
  | { ok: true; data: PublicBookingLookup }
  | { ok: false; code: "INVALID_CODE" | "NOT_FOUND" | "DB_ERROR"; message: string };

export type ConsultErrorCode = "INVALID_CODE" | "NOT_FOUND" | "DB_ERROR" | "CAPTCHA" | "RATE_LIMITED";

// UI state for the consultation form: idle until the user submits, then either
// a found booking or an error message.
export type ConsultState =
  | { status: "idle" }
  | { status: "success"; booking: PublicBookingLookup }
  | { status: "error"; code: ConsultErrorCode; message: string };

export function toConsultState(result: LookupResult): ConsultState {
  if (result.ok) return { status: "success", booking: result.data };
  return { status: "error", code: result.code, message: result.message };
}

export async function lookupBookingByPublicCode(
  fetch: LookupFetcher,
  code: string,
): Promise<LookupResult> {
  const parsed = publicCodeSchema.safeParse(code);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_CODE", message: "Informe um código de reserva válido." };
  }

  const { data, error } = await fetch(parsed.data);
  if (error) {
    return { ok: false, code: "DB_ERROR", message: "Não foi possível consultar a reserva." };
  }
  if (!data) {
    return { ok: false, code: "NOT_FOUND", message: "Nenhuma reserva encontrada com esse código." };
  }

  return {
    ok: true,
    data: {
      serviceName: data.service_name,
      startAt: data.start_at,
      endAt: data.end_at,
      businessName: data.business_name,
      businessSlug: data.business_slug,
      businessPhone: data.business_phone,
    },
  };
}

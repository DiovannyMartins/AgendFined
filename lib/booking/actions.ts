"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { bookingSchema, publicCodeSchema } from "@/lib/validation/schemas";
import {
  lookupBookingByPublicCode,
  toConsultState,
  type ConsultState,
} from "@/lib/bookings/lookup";
import { verifyCancelToken } from "@/lib/bookings/cancel";
import { isWaitlistEligible, parseWaitlistInput } from "@/lib/waitlist/waitlist";
import {
  computeAvailableSlots,
  localDayRangeUtc,
  toUtcRange,
  weekdayOf,
  zonedTimeToUtc,
  type SlotInterval,
  type UtcRange,
} from "@/lib/booking/availability";
import { enforceRateLimit, enforceConsultRateLimit, getClientIp } from "@/lib/booking/rate-limit";
import { verifyTurnstile } from "@/lib/booking/anti-bot";

export type ActionResult = { ok: boolean; code?: string; message?: string; publicCode?: string };

type ServerClient = ReturnType<typeof createAdminClient>;

export async function createBooking(input: {
  slug: string;
  serviceId: string;
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerNote?: string;
  cfTurnstileToken?: string;
}): Promise<ActionResult> {
  // Server-authoritative flow: the admin client reads blocks/bookings of any
  // business (anonymous RLS would block those reads) for revalidation.
  const preamble = await resolvePublicBusinessAndRateLimit(input.slug, input.cfTurnstileToken);
  if (!preamble.ok) return preamble.result;
  const { supabase, business } = preamble;

  const startAtIso = zonedTimeToUtc(input.date, input.startTime);

  const parsed = bookingSchema.safeParse({
    serviceId: input.serviceId,
    startAt: startAtIso,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail || "",
    customerNote: input.customerNote || "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Revise os dados. " + parsed.error.issues[0]?.message,
    };
  }

  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", input.serviceId)
    .eq("business_id", business.id)
    .eq("is_active", true)
    .single();
  if (!service) {
    return { ok: false, code: "service_not_found", message: "Serviço indisponível." };
  }

  // Server-side revalidation of availability (§11.3 step 5). `getSlotRange`
  // returns null only when the day has no active availability range for the
  // business.
  const slotRange = await getSlotRange(supabase, business.id, input.date);
  if (slotRange === null) {
    return { ok: false, code: "no_availability", message: "Este dia não possui horários disponíveis. Escolha outra data." };
  }

  const rules = {
    slotIntervalMinutes: business.slot_interval_minutes,
    minNoticeMinutes: business.min_notice_minutes,
    bookingWindowDays: business.booking_window_days,
  };
  const available = computeAvailableSlots({
    intervals: slotRange.intervals,
    rules,
    durationMinutes: service.duration_minutes,
    date: input.date,
    now: new Date(),
    blocks: slotRange.blocks,
    occupancies: slotRange.occupancies,
  });
  if (!available.includes(input.startTime)) {
    return { ok: false, code: "slot_taken", message: "Esse horário não está mais disponível. Escolha outro." };
  }

  // Remote re-reads the service and enforces the overlap constraint (§11.4).
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_booking", {
    p_business_id: business.id,
    p_service_id: service.id,
    p_start_at: startAtIso,
    p_customer_name: parsed.data.customerName,
    p_customer_phone: parsed.data.customerPhone,
    p_customer_email: parsed.data.customerEmail || undefined,
    p_customer_note: parsed.data.customerNote || undefined,
  });

  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("bookings_no_overlap") || /overlap|SLOT|23P01/i.test(message)) {
      return { ok: false, code: "slot_taken", message: "Esse horário acabou de ser reservado. Escolha outro." };
    }
    return { ok: false, code: "db_error", message: "Não foi possível concluir a reserva. Tente novamente." };
  }

  return { ok: true, publicCode: data?.public_code };
}

// Public consultation of a reservation by its public code. Uses the server-only
// admin client (service role) — the lookup RPC is revoked from anon and granted
// only to service_role (migration 0016), so public access must flow through the
// server. The result carries only non-personal data (service, date/time, business
// contact). Gated by a per-IP rate limit and the optional Turnstile anti-bot
// check (fail-open).
export async function consultBooking(
  _prev: ConsultState,
  formData: FormData,
): Promise<ConsultState> {
  const code = String(formData.get("code") ?? "");
  const turnstileToken = String(formData.get("cfTurnstileToken") ?? "");
  const gate = await verifyTurnstile(turnstileToken || undefined);
  if (!gate.ok) {
    return { status: "error", code: "CAPTCHA", message: "Verificação humana falhou. Tente novamente." };
  }

  const supabase = createAdminClient();

  const ip = await getClientIp();
  // Fail-open on the limiter: a transient DB error during a public lookup should
  // not block a legitimate consultation, unlike the reservation flow where the
  // limiter is fail-closed.
  let allowed: boolean;
  try {
    allowed = await enforceConsultRateLimit(supabase, ip);
  } catch {
    allowed = true;
  }
  if (!allowed) {
    return {
      status: "error",
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    };
  }

  const result = await lookupBookingByPublicCode(
    async (c) => {
      const { data, error } = await supabase.rpc("get_booking_by_public_code", { p_code: c });
      return { data: data?.[0] ?? null, error };
    },
    code,
  );
  return toConsultState(result);
}

// Self-service cancellation (INC-3). The caller must present the token derived
// from the booking's public_code (HMAC-SHA256 with CANCEL_TOKEN_SECRET); the
// public lookup never returns it, so possession is the proof of the customer's
// own reservation. The RPC performs the atomic confirmed -> cancelled transition
// (service_role-only), which also frees the slot for a new reservation. Gated by
// a fail-open per-IP rate limit like the consultation flow.
export type CancelState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; code: "INVALID_TOKEN" | "NOT_FOUND" | "NOT_CONFIRMED" | "DB_ERROR" | "RATE_LIMITED"; message: string };

export async function cancelPublicBooking(
  _prev: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const code = String(formData.get("code") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const reason = String(formData.get("cancelReason") ?? "").trim() || undefined;

  const parsed = publicCodeSchema.safeParse(code);
  if (!parsed.success) {
    return { status: "error", code: "NOT_FOUND", message: "Informe um código de reserva válido." };
  }

  const secret = process.env.CANCEL_TOKEN_SECRET ?? "";
  if (!verifyCancelToken(secret, parsed.data, token)) {
    return {
      status: "error",
      code: "INVALID_TOKEN",
      message: "Você precisa abrir a confirmação desta reserva para cancelá-la.",
    };
  }

  const supabase = createAdminClient();

  const ip = await getClientIp();
  let allowed: boolean;
  try {
    allowed = await enforceConsultRateLimit(supabase, ip);
  } catch {
    allowed = true;
  }
  if (!allowed) {
    return {
      status: "error",
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    };
  }

  const { error } = await supabase.rpc("cancel_booking_by_public_code", {
    p_code: parsed.data,
    p_cancel_reason: reason,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (/BOOKING_NOT_FOUND/i.test(msg)) {
      return { status: "error", code: "NOT_FOUND", message: "Reserva não encontrada." };
    }
    if (/BOOKING_NOT_CONFIRMED/i.test(msg)) {
      return { status: "error", code: "NOT_CONFIRMED", message: "Esta reserva já não pode ser cancelada." };
    }
    return { status: "error", code: "DB_ERROR", message: "Não foi possível cancelar. Tente novamente." };
  }

  return { status: "done" };
}

// Waitlist join (INC-3). When a customer's preferred slot is already occupied
// they can leave their contact + the desired slot so a later opening can be
// offered. The server re-validates everything (business/slot/contact),
// requires the slot to be genuinely occupied (a free slot should just be booked),
// and the `join_waitlist` RPC enforces integrity + dedup atomically. Same anti-bot
// and fail-closed reservation limiter as createBooking: this is an anonymous write.
export async function joinWaitlist(input: {
  slug: string;
  serviceId: string;
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  cfTurnstileToken?: string;
}): Promise<ActionResult> {
  // Same server-authoritative preamble as createBooking: this is an anonymous
  // write, so anti-bot, business resolution and the fail-closed reservation
  // limiter apply identically.
  const preamble = await resolvePublicBusinessAndRateLimit(input.slug, input.cfTurnstileToken);
  if (!preamble.ok) return preamble.result;
  const { business } = preamble;

  const startAt = zonedTimeToUtc(input.date, input.startTime);

  const parsed = parseWaitlistInput({
    serviceId: input.serviceId,
    startAt,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
  });
  if (!parsed.ok) {
    return { ok: false, code: "validation", message: "Revise os dados. " + parsed.message };
  }

  if (!isWaitlistEligible(startAt, new Date())) {
    return { ok: false, code: "no_future", message: "Esse horário já passou e não pode entrar na lista de espera." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("join_waitlist", {
    p_business_id: business.id,
    p_service_id: parsed.data.serviceId,
    p_start_at: parsed.data.startAt,
    p_customer_name: parsed.data.customerName,
    p_customer_phone: parsed.data.customerPhone,
    p_customer_email: parsed.data.customerEmail || undefined,
  });

  if (error || !data) {
    const msg = String(error?.message ?? "");
    if (/WAITLIST_SLOT_NOT_OCCUPIED/i.test(msg)) {
      return { ok: false, code: "slot_free", message: "Esse horário está livre — você pode reservá-lo." };
    }
    return { ok: false, code: "db_error", message: "Não foi possível entrar na lista de espera. Tente novamente." };
  }

  return { ok: true, message: "Você entrou na lista de espera deste horário." };
}

// Shared preamble for the anonymous public writes (createBooking, joinWaitlist):
// anti-bot gate (fail-closed when Turnstile is configured), resolve the active
// business by slug, and apply the fail-closed reservation rate limit. Returns the
// admin client and the resolved business, or an `ActionResult` error to surface.
type ResolvedBusiness = {
  id: string;
  slot_interval_minutes: number;
  min_notice_minutes: number;
  booking_window_days: number;
};

async function resolvePublicBusinessAndRateLimit(
  slug: string,
  cfTurnstileToken?: string,
): Promise<{ ok: true; supabase: ServerClient; business: ResolvedBusiness } | { ok: false; result: ActionResult }> {
  const supabase = createAdminClient();

  const gate = await verifyTurnstile(cfTurnstileToken);
  if (!gate.ok) {
    return { ok: false, result: { ok: false, code: "captcha_failed", message: "Verificação humana falhou. Tente novamente." } };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!business) {
    return { ok: false, result: { ok: false, code: "not_found", message: "Página não encontrada." } };
  }

  // Rate limit before expensive work, keyed on IP+business and a business-wide
  // aggregate (never only on the customer phone).
  const ip = await getClientIp();
  const allowed = await enforceRateLimit(supabase, ip, business.id);
  if (!allowed) {
    return {
      ok: false,
      result: { ok: false, code: "rate_limited", message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
    };
  }

  return { ok: true, supabase, business };
}

type SlotRange = {
  intervals: SlotInterval[];
  blocks: UtcRange[];
  occupancies: UtcRange[];
};

async function getSlotRange(
  supabase: ServerClient,
  businessId: string,
  date: string,
): Promise<SlotRange | null> {
  const weekday = weekdayOf(date);

  // Availability, blocks and occupied slots belong to the business, so the
  // revalidation is scoped to the business.
  const { data: intervals } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("business_id", businessId)
    .eq("weekday", weekday)
    .eq("is_active", true);

  if (!intervals || intervals.length === 0) return null;

  const day = localDayRangeUtc(date);

  const [{ data: blocks }, { data: bookings }] = await Promise.all([
    supabase
      .from("availability_blocks")
      .select("start_at, end_at")
      .eq("business_id", businessId)
      .lt("start_at", day.end)
      .gt("end_at", day.start),
    supabase
      .from("bookings")
      .select("start_at, end_at")
      .eq("business_id", businessId)
      .neq("status", "cancelled")
      .lt("start_at", day.end)
      .gt("end_at", day.start),
  ]);

  return {
    intervals: intervals.map((i) => ({ startTime: i.start_time, endTime: i.end_time })),
    blocks: (blocks ?? []).map((b) => toUtcRange(b.start_at, b.end_at)),
    occupancies: (bookings ?? []).map((b) => toUtcRange(b.start_at, b.end_at)),
  };
}


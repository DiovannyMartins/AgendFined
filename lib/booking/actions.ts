"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database-types";
import { z } from "zod";
import {
  customerDetailsSchema,
  publicBookingSchema,
  publicCodeSchema,
  publicSlotSchema,
  waitlistSchema,
} from "@/lib/validation/schemas";
import {
  lookupBookingByPublicCode,
  toConsultState,
  type ConsultState,
} from "@/lib/bookings/lookup";
import { generateCancelToken, hashCancelToken, isValidCancelToken } from "@/lib/bookings/cancel";
import { isWaitlistEligible, parseWaitlistInput } from "@/lib/waitlist/waitlist";
import {
  computeAvailableSlots,
  isWithinWindow,
  localDayRangeUtc,
  toUtcRange,
  weekdayOf,
  zonedTimeToUtc,
  type SlotInterval,
  type UtcRange,
} from "@/lib/booking/availability";
import { enforceRateLimit, enforceConsultRateLimit, getClientIp } from "@/lib/booking/rate-limit";
import { verifyTurnstile } from "@/lib/booking/anti-bot";
import { assertProPlan, getEffectiveBookingWindowDays } from "@/lib/plan/plan";
import type { Plan } from "@/lib/plan/plan";
import { sendBookingConfirmationEmail } from "@/lib/email/booking-confirmation";
import { sendCustomerCancelledEmail } from "@/lib/email/booking-cancellation";
import { notifyOwner } from "@/lib/bookings/owner-notification";
import {
  classifyCancellationReason,
  classifyCustomerNote,
  classifyOperationalError,
} from "@/lib/bookings/classification";
import { syncGoogleCalendarBooking } from "@/lib/google-calendar/sync";
import { buildPrivateConfirmationUrl } from "@/lib/bookings/private-confirmation";
import { buildPublicBookingUrl } from "@/lib/bookings/public-booking-url";
import { BOOKING_ALREADY_STARTED_MESSAGE } from "@/lib/bookings/public-status";
import { resolveAppOrigin } from "@/lib/app-origin";

export type ActionResult = {
  ok: boolean;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  publicCode?: string;
  cancelToken?: string;
};

type ServerClient = ReturnType<typeof createAdminClient>;

// A malformed date/startTime (only a forged request sends one) is refused
// before the anti-bot gate and before zonedTimeToUtc, which would throw on it.
const INVALID_SLOT_RESULT: ActionResult = {
  ok: false,
  code: "validation",
  message: "Não foi possível validar o serviço ou o horário. Escolha novamente.",
};

const waitlistCustomerSchema = waitlistSchema.pick({
  customerName: true,
  customerPhone: true,
  customerEmail: true,
});

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
  // Validate the customer's own data before the anti-bot gate and the rate
  // limit: a typo must not spend the single-use Turnstile token, and the
  // per-field errors let the page keep the chosen slot while the customer fixes it.
  const customer = customerDetailsSchema.safeParse(
    {
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? "",
      customerNote: input.customerNote || "",
    },
    { error: () => "Revise este campo." },
  );
  if (!customer.success) {
    return {
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: z.flattenError(customer.error).fieldErrors,
    };
  }
  if (!publicSlotSchema.safeParse(input).success) return INVALID_SLOT_RESULT;

  // Server-authoritative flow: the admin client reads blocks/bookings of any
  // business (anonymous RLS would block those reads) for revalidation.
  const preamble = await resolvePublicBusinessAndRateLimit(input.slug, input.cfTurnstileToken);
  if (!preamble.ok) return preamble.result;
  const { supabase, business } = preamble;

  const startAtIso = zonedTimeToUtc(input.date, input.startTime, business.timezone);

  const parsed = publicBookingSchema.safeParse({
    serviceId: input.serviceId,
    startAt: startAtIso,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail ?? "",
    customerNote: input.customerNote || "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      // Customer fields were validated above; only the service/slot can fail here.
      message: "Não foi possível validar o serviço ou o horário. Escolha novamente.",
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
  let slotRange: SlotRange | null;
  try {
    slotRange = await getSlotRange(supabase, business.id, input.date, business.timezone);
  } catch {
    return {
      ok: false,
      code: "db_error",
      message: "Não foi possível verificar a disponibilidade. Tente novamente.",
    };
  }
  if (slotRange === null) {
    return { ok: false, code: "no_availability", message: "Este dia não possui horários disponíveis. Escolha outra data." };
  }

  const rules = {
    slotIntervalMinutes: business.slot_interval_minutes,
    minNoticeMinutes: business.min_notice_minutes,
    bookingWindowDays: getEffectiveBookingWindowDays(business.plan, business.booking_window_days),
    timezone: business.timezone,
  };
  if (!isWithinWindow(input.date, rules, new Date())) {
    return {
      ok: false,
      code: "booking_window",
      message: `A data está fora da janela de reservas de ${rules.bookingWindowDays} dias deste negócio.`,
    };
  }
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
  const cancelToken = generateCancelToken();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_booking", {
    p_business_id: business.id,
    p_service_id: service.id,
    p_start_at: startAtIso,
    p_customer_name: parsed.data.customerName,
    p_customer_phone: parsed.data.customerPhone,
    p_customer_email: parsed.data.customerEmail,
    p_customer_note: parsed.data.customerNote || undefined,
    p_cancel_token_hash: hashCancelToken(cancelToken),
  });

  if (error) {
    const message = String(error.message ?? "");
    if (/BOOKING_OUTSIDE_PLAN_WINDOW/i.test(message)) {
      return {
        ok: false,
        code: "booking_window",
        message: "O plano deste negócio não permite reservas para essa data.",
      };
    }
    if (message.includes("bookings_no_overlap") || /overlap|SLOT|23P01/i.test(message)) {
      return { ok: false, code: "slot_taken", message: "Esse horário acabou de ser reservado. Escolha outro." };
    }
    const judgment = await classifyOperationalError("create_booking", message);
    if (judgment?.category === "slot_conflict" && judgment.confidence >= 0.8) {
      return { ok: false, code: "slot_taken", message: "Esse horário acabou de ser reservado. Escolha outro." };
    }
    return { ok: false, code: "db_error", message: "Não foi possível concluir a reserva. Tente novamente." };
  }

  if (data?.id && data.public_code) {
    // The dono hears about the reserva in parallel with the cliente's
    // confirmação; notifyOwner never throws (#146).
    const [emailResult] = await Promise.all([
      sendBookingConfirmationEmail({
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        businessName: business.name,
        serviceName: service.name,
        startAt: startAtIso,
        timezone: business.timezone,
        publicCode: data.public_code,
        confirmationUrl: buildPrivateConfirmationUrl(
          resolveAppOrigin(),
          input.slug,
          data.public_code,
          cancelToken,
        ),
      }),
      notifyOwner(admin, "new_booking", {
        bookingId: data.id,
        ownerId: business.owner_id,
        businessName: business.name,
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        serviceName: service.name,
        startAt: startAtIso,
        timezone: business.timezone,
        publicCode: data.public_code,
      }),
    ]);
    if (!emailResult.sent) {
      console.error("booking_confirmation_email_failed", {
        bookingId: data.id,
        reason: emailResult.reason,
      });
    }
  }

  if (data?.id && parsed.data.customerNote) {
    const judgment = await classifyCustomerNote(parsed.data.customerNote);
    if (judgment && judgment.categoryConfidence >= 0.7) {
      await admin
        .from("bookings")
        .update({
          customer_note_category: judgment.category,
          customer_note_requires_follow_up: judgment.requiresManualFollowUp,
        })
        .eq("id", data.id)
        .eq("business_id", business.id);
    }
  }

  // Calendar sync is best effort: a temporary Google outage must never make a
  // valid public reservation fail. The periodic scheduler remains the safety net.
  if (data?.id) {
    try {
      await syncGoogleCalendarBooking(business.id, data.id);
    } catch (error) {
      console.error("google_calendar_booking_sync_failed", { bookingId: data.id, reason: error instanceof Error ? error.message : "unknown" });
    }
  }

  return data?.public_code
    ? { ok: true, publicCode: data.public_code, cancelToken }
    : { ok: false, code: "db_error", message: "Não foi possível concluir a reserva. Tente novamente." };
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
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const turnstileToken = String(formData.get("cfTurnstileToken") ?? "");

  // Validate the user input before running the anti-bot gate. Otherwise a
  // malformed code is reported as a Turnstile failure, hiding the actionable
  // validation message and making the consultation flow look broken.
  const parsedCode = publicCodeSchema.safeParse(code);
  if (!parsedCode.success) {
    return {
      status: "error",
      code: "INVALID_CODE",
      message: "Informe um código de reserva válido.",
    };
  }
  if (!slug || slug.length > 50) {
    return { status: "error", code: "NOT_FOUND", message: "Nenhuma reserva encontrada com esse código." };
  }

  const ip = await getClientIp();
  const gate = await verifyTurnstile(turnstileToken || undefined, {
    expectedAction: "booking_consult",
    remoteIp: ip,
  });
  if (!gate.ok) {
    return { status: "error", code: "CAPTCHA", message: "Verificação humana falhou. Tente novamente." };
  }

  const supabase = createAdminClient();

  let allowed: boolean;
  try {
    allowed = await enforceConsultRateLimit(supabase, ip);
  } catch {
    allowed = false;
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
    parsedCode.data,
  );
  if (result.ok && result.data.businessSlug !== slug) {
    return { status: "error", code: "NOT_FOUND", message: "Nenhuma reserva encontrada com esse código." };
  }
  return toConsultState(result);
}

// Self-service cancellation requires the independent private capability issued
// at booking creation. The database stores only its digest and performs the
// digest check plus confirmed -> cancelled transition atomically.
export type CancelState =
  | { status: "idle" }
  | { status: "done" }
  | {
      status: "error";
      code: "INVALID_TOKEN" | "NOT_FOUND" | "NOT_CONFIRMED" | "DB_ERROR" | "RATE_LIMITED" | "ALREADY_STARTED";
      message: string;
    };

export async function cancelPublicBooking(
  _prev: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const code = String(formData.get("code") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const reason = String(formData.get("cancelReason") ?? "").trim() || undefined;

  const parsed = publicCodeSchema.safeParse(code);
  if (!parsed.success || !isValidCancelToken(token)) return cancellationRejected();

  const supabase = createAdminClient();

  const ip = await getClientIp();
  let allowed: boolean;
  try {
    allowed = await enforceConsultRateLimit(supabase, ip);
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return {
      status: "error",
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    };
  }

  const { data: cancelled, error } = await supabase.rpc("cancel_booking_by_public_code", {
    p_code: parsed.data,
    p_cancel_token_hash: hashCancelToken(token),
    p_cancel_reason: reason,
  });

  // Only reached with a valid capability, so it reveals nothing new (#141).
  if (error?.message.includes("BOOKING_ALREADY_STARTED")) {
    return { status: "error", code: "ALREADY_STARTED", message: BOOKING_ALREADY_STARTED_MESSAGE };
  }
  if (error) return cancellationRejected();

  // The RPC returns the row it just cancelled; it is the source of truth for
  // everything that follows, so bookings is never read again here.
  try {
    await syncGoogleCalendarBooking(cancelled.business_id, cancelled.id);
  } catch (syncError) {
    console.error("google_calendar_booking_sync_failed", { bookingId: cancelled.id, reason: syncError instanceof Error ? syncError.message : "unknown" });
  }

  await notifyCancellation(supabase, cancelled);

  if (reason) {
    const judgment = await classifyCancellationReason(reason);
    if (judgment && judgment.confidence >= 0.7) {
      await supabase
        .from("bookings")
        .update({ cancel_reason_category: judgment.category })
        .eq("id", cancelled.id);
    }
  }

  return { status: "done" };
}

// Only called for a cancellation that really happened: e-mails the cliente
// (when the reserva has an e-mail) and tells the dono (#146). Best effort, like
// the confirmação: no failure here (missing negócio, provider error or an
// exception) ever undoes the cancellation; it is only logged. Neither e-mail
// carries the token, the private link or the cancel reason.
async function notifyCancellation(
  supabase: ServerClient,
  cancelled: Database["public"]["Functions"]["cancel_booking_by_public_code"]["Returns"],
): Promise<void> {
  const logFailure = (reason: string) =>
    console.error("booking_cancellation_email_failed", { bookingId: cancelled.id, reason });

  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, slug, timezone, owner_id")
      .eq("id", cancelled.business_id)
      .maybeSingle();
    if (!business) return logFailure("business_not_found");

    const customerEmail = cancelled.customer_email_snapshot;
    const [emailResult] = await Promise.all([
      customerEmail
        ? sendCustomerCancelledEmail({
            customerName: cancelled.customer_name_snapshot,
            customerEmail,
            businessName: business.name,
            serviceName: cancelled.service_name_snapshot,
            startAt: cancelled.start_at,
            timezone: business.timezone,
            publicCode: cancelled.public_code,
            rebookUrl: buildPublicBookingUrl(resolveAppOrigin(), business.slug),
          })
        : null,
      notifyOwner(supabase, "customer_cancelled", {
        bookingId: cancelled.id,
        ownerId: business.owner_id,
        businessName: business.name,
        customerName: cancelled.customer_name_snapshot,
        customerPhone: cancelled.customer_phone_snapshot,
        serviceName: cancelled.service_name_snapshot,
        startAt: cancelled.start_at,
        timezone: business.timezone,
        publicCode: cancelled.public_code,
      }),
    ]);
    if (emailResult && !emailResult.sent) logFailure(emailResult.reason);
  } catch {
    logFailure("unexpected_error");
  }
}

function cancellationRejected(): CancelState {
  return {
    status: "error",
    code: "INVALID_TOKEN",
    message: "Não foi possível cancelar esta reserva.",
  };
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
  // As in createBooking, the customer's own data is checked before the anti-bot
  // gate so a typo neither spends the Turnstile token nor hides its field error.
  const customer = waitlistCustomerSchema.safeParse(
    {
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? "",
    },
    { error: () => "Revise este campo." },
  );
  if (!customer.success) {
    return {
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: z.flattenError(customer.error).fieldErrors,
    };
  }
  if (!publicSlotSchema.safeParse(input).success) return INVALID_SLOT_RESULT;

  // Same server-authoritative preamble as createBooking: this is an anonymous
  // write, so anti-bot, business resolution and the fail-closed reservation
  // limiter apply identically.
  const preamble = await resolvePublicBusinessAndRateLimit(input.slug, input.cfTurnstileToken);
  if (!preamble.ok) return preamble.result;
  const { business } = preamble;

  // Waitlist management is a PROFISSIONAL feature (ADR 0008): a Grátis business
  // has nobody to follow the request up, so the entry is refused before any
  // write. The message never names the plan to the customer.
  if (!assertProPlan(business).ok) {
    return {
      ok: false,
      code: "waitlist_unavailable",
      message: "Esse horário acabou de ser reservado. Escolha outro.",
    };
  }

  const startAt = zonedTimeToUtc(input.date, input.startTime, business.timezone);

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
  owner_id: string;
  name: string;
  plan: Plan | null;
  slot_interval_minutes: number;
  min_notice_minutes: number;
  booking_window_days: number;
  timezone: string;
};

async function resolvePublicBusinessAndRateLimit(
  slug: string,
  cfTurnstileToken?: string,
): Promise<{ ok: true; supabase: ServerClient; business: ResolvedBusiness } | { ok: false; result: ActionResult }> {
  const supabase = createAdminClient();

  const ip = await getClientIp();
  const gate = await verifyTurnstile(cfTurnstileToken, {
    expectedAction: "booking_write",
    remoteIp: ip,
  });
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
  timezone: string,
): Promise<SlotRange | null> {
  const weekday = weekdayOf(date, timezone);

  // Availability, blocks and occupied slots belong to the business, so the
  // revalidation is scoped to the business.
  const { data: intervals, error: intervalsError } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("business_id", businessId)
    .eq("weekday", weekday)
    .eq("is_active", true);

  if (intervalsError) throw new Error(intervalsError.message);
  if (!intervals || intervals.length === 0) return null;

  const day = localDayRangeUtc(date, timezone);

  const [{ data: blocks, error: blocksError }, { data: bookings, error: bookingsError }] = await Promise.all([
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

  // Availability revalidation is security-critical: a read failure must not be
  // interpreted as an empty schedule, otherwise a booking can bypass a block
  // or an existing occupancy.
  if (blocksError) throw new Error(blocksError.message);
  if (bookingsError) throw new Error(bookingsError.message);

  return {
    intervals: intervals.map((i) => ({ startTime: i.start_time, endTime: i.end_time })),
    blocks: (blocks ?? []).map((b) => toUtcRange(b.start_at, b.end_at)),
    occupancies: (bookings ?? []).map((b) => toUtcRange(b.start_at, b.end_at)),
  };
}


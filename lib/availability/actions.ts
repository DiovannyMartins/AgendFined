"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { availabilitySchema, blockSchema } from "@/lib/validation/schemas";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { getCurrentBusiness } from "@/lib/business/queries";
import { formatWhen } from "@/lib/format/when";
import type { ActionResult } from "@/lib/business/actions";
import { localDateTimeToUtc, overlaps } from "@/lib/booking/availability";
import { weekdayName } from "@/lib/availability/weekdays";
import {
  bookingLocalDate,
  bookingsOutsideAvailability,
  bookingWeekday,
  outsideBookingsMessage,
} from "@/lib/availability/outside-bookings";

export type { ActionResult };

// What an edit or removal left behind: reservas confirmadas e futuras that no
// faixa covers anymore (#192). `agendaDate` opens the agenda on the first one.
export type AvailabilityChange = { warning: string; agendaDate: string | null } | undefined;

// The disponibilidade is the rule for new reservas, so a change is never
// blocked and nothing is cancelled: the owner is only told what was left out.
// Only the weekday that lost coverage is checked, so reservas of other days
// are not blamed on this change.
async function outsideBookingsNotice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  business: { id: string; timezone: string | null },
  weekday: number,
): Promise<AvailabilityChange> {
  const timezone = business.timezone || APP_TIMEZONE;
  const [{ data: faixas, error: faixasError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("availability")
      .select("weekday, start_time, end_time")
      .eq("business_id", business.id)
      .eq("is_active", true),
    supabase
      .from("bookings")
      .select("customer_name_snapshot, start_at, end_at")
      .eq("business_id", business.id)
      .eq("status", "confirmed")
      .gt("start_at", new Date().toISOString()),
  ]);

  // The change is already saved; say the check is missing instead of failing it.
  if (faixasError || bookingsError) {
    return {
      warning: "Horário salvo, mas não foi possível conferir as reservas já marcadas. Confira a agenda.",
      agendaDate: null,
    };
  }

  const sameDay = (bookings ?? []).filter((b) => bookingWeekday(b, timezone) === weekday);
  const outside = bookingsOutsideAvailability(sameDay, faixas ?? [], timezone).sort(
    (a, b) => Date.parse(a.start_at) - Date.parse(b.start_at),
  );
  if (outside.length === 0) return undefined;
  return { warning: outsideBookingsMessage(outside, timezone), agendaDate: bookingLocalDate(outside[0], timezone) };
}

export async function setAvailability(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // The same faixa can be added to several days at once (#149).
  const weekdays = [...new Set(formData.getAll("weekday").map(Number))];
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");

  if (weekdays.length === 0) {
    return { ok: false, code: "VALIDATION", message: "Escolha pelo menos um dia da semana." };
  }

  const faixas = [];
  for (const weekday of weekdays) {
    const parsed = availabilitySchema.safeParse({ weekday, startTime, endTime });
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION",
        // Every availabilitySchema message is pt-BR and names the problem (e.g. an
        // inverted faixa), so it is shown as is instead of a generic hint.
        message: parsed.error.issues[0]?.message ?? "Revise os campos de disponibilidade.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    faixas.push(parsed.data);
  }

  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const supabase = await createClient();

  // §9.3: same business + day ranges must not overlap (agenda is per business).
  const { data: existing } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .in("weekday", weekdays)
    .eq("is_active", true);

  for (const faixa of faixas) {
    const clash = (existing ?? []).find(
      (row) => row.weekday === faixa.weekday && overlaps({ start: row.start_time, end: row.end_time }, { start: startTime, end: endTime }),
    );
    if (clash) {
      return {
        ok: false,
        code: "OVERLAP",
        message:
          faixas.length > 1
            ? `${weekdayName(faixa.weekday)}: este intervalo se sobrepõe a um já existente. Nenhuma faixa foi adicionada.`
            : "Este intervalo se sobrepõe a um já existente neste dia.",
      };
    }
  }

  // One insert for every day: either all faixas are added or none is.
  const { error } = await supabase.from("availability").insert(
    faixas.map((faixa) => ({
      business_id: business.id,
      weekday: faixa.weekday,
      start_time: faixa.startTime,
      end_time: faixa.endTime,
    })),
  );

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar." };

  // Adding a faixa only widens the disponibilidade, so no reserva is left out
  // and there is nothing to check (#192).
  revalidatePath("/dashboard/bloqueios");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: undefined };
}

export async function updateAvailability(
  id: string,
  _prev: ActionResult<AvailabilityChange>,
  formData: FormData,
): Promise<ActionResult<AvailabilityChange>> {
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");

  const parsed = availabilitySchema.safeParse({ weekday, startTime, endTime });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      // Every availabilitySchema message is pt-BR and names the problem (e.g. an
      // inverted faixa), so it is shown as is instead of a generic hint.
      message: parsed.error.issues[0]?.message ?? "Revise os campos de disponibilidade.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const supabase = await createClient();

  // The weekday before the edit is the one that may lose coverage (#192).
  const { data: current, error: currentError } = await supabase
    .from("availability")
    .select("weekday")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (currentError) return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar." };
  if (!current) return { ok: false, code: "NOT_FOUND", message: "Horário não encontrado." };

  // §9.3: same business + day ranges must not overlap (agenda is per business).
  // Exclude the row being edited so saving without changes always succeeds.
  const { data: existing } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .eq("weekday", parsed.data.weekday)
    .eq("is_active", true)
    .neq("id", id);

  for (const row of existing ?? []) {
    if (overlaps({ start: row.start_time, end: row.end_time }, { start: startTime, end: endTime })) {
      return {
        ok: false,
        code: "OVERLAP",
        message: "Este intervalo se sobrepõe a um já existente neste dia.",
      };
    }
  }

  const { error } = await supabase
    .from("availability")
    .update({
      weekday: parsed.data.weekday,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
    })
    .eq("id", id)
    .eq("business_id", business.id);

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar." };

  revalidatePath("/dashboard/bloqueios");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: await outsideBookingsNotice(supabase, business, current.weekday) };
}

export async function deleteAvailability(id: string): Promise<ActionResult<AvailabilityChange>> {
  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("availability")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id)
    .select("id, weekday");
  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível excluir o horário." };
  if (!data?.length) return { ok: false, code: "NOT_FOUND", message: "Horário não encontrado." };
  revalidatePath("/dashboard/bloqueios");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: await outsideBookingsNotice(supabase, business, data[0].weekday) };
}

export async function createBlock(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = blockSchema.safeParse({
    startAt: String(formData.get("startAt") ?? ""),
    endAt: String(formData.get("endAt") ?? ""),
    reason: String(formData.get("reason") ?? "").trim() || null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Informe o início e o fim do bloqueio.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  // datetime-local has no offset: resolve it in the business timezone here so
  // the conflict check and the insert use the same UTC instants (§10.2).
  const timezone = business.timezone || APP_TIMEZONE;
  const startAt = localDateTimeToUtc(parsed.data.startAt, timezone);
  const endAt = localDateTimeToUtc(parsed.data.endAt, timezone);
  const reason = parsed.data.reason ?? null;

  if (Date.parse(endAt) <= Date.parse(startAt)) {
    return { ok: false, code: "VALIDATION", message: "O fim deve ser depois do início." };
  }
  // A period that already ended blocks nothing; it only clutters the list.
  if (Date.parse(endAt) <= Date.now()) {
    return { ok: false, code: "VALIDATION", message: "Esse período já passou. Escolha um fim no futuro." };
  }

  const supabase = await createClient();

  // §9.4: cannot create a block overlapping a booking of the same business that
  // can still happen (#143). A block may start in the past, so completed,
  // no_show and already-ended confirmed bookings in that part do not conflict.
  const now = new Date().toISOString();
  const { data: conflicting, error: conflictError } = await supabase
    .from("bookings")
    .select("id, customer_name_snapshot, start_at, end_at")
    .eq("business_id", business.id)
    .eq("status", "confirmed")
    .gt("end_at", Date.parse(startAt) > Date.parse(now) ? startAt : now)
    .lt("start_at", endAt);

  // Fail closed: without the check, the insert could hide a reserva behind a block.
  if (conflictError) {
    return { ok: false, code: "DB_ERROR", message: "Não foi possível verificar conflitos. Tente novamente." };
  }

  if (conflicting && conflicting.length > 0) {
    const list = conflicting
      .map((b) => `${b.customer_name_snapshot} (${formatWhen(b.start_at, timezone)})`)
      .join(", ");
    return {
      ok: false,
      code: "BOOKING_CONFLICT",
      message: `Bloqueio conflita com reserva(s) confirmada(s): ${list}. Cancele essas reservas ou escolha outro período.`,
    };
  }

  const { error } = await supabase.from("availability_blocks").insert({
    business_id: business.id,
    start_at: startAt,
    end_at: endAt,
    reason,
  });

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar o bloqueio." };

  revalidatePath("/dashboard/bloqueios");
  return { ok: true, data: undefined };
}

export async function deleteBlock(id: string): Promise<ActionResult> {
  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("availability_blocks")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id)
    .select("id");
  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível excluir o bloqueio." };
  if (!data?.length) return { ok: false, code: "NOT_FOUND", message: "Bloqueio não encontrado." };
  revalidatePath("/dashboard/bloqueios");
  return { ok: true, data: undefined };
}

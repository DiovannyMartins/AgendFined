"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { businessSchema } from "@/lib/validation/schemas";
import { getBookingWindowLimitDays, type Plan } from "@/lib/plan/plan";
import { RESERVED_SLUG_MESSAGE, isReservedSlug } from "@/lib/business/reserved-slugs";

export type ActionResult<T = undefined, E = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      fieldErrors?: Record<string, string[]>;
      details?: E;
    };

type BusinessPayload = {
  id?: string;
  name: string;
  slug: string;
  phone: string;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  bookingWindowDays: number;
  timezone: string;
  description?: string | null;
};

type ParsedBusiness = z.infer<typeof businessSchema>;

export type ActionResultState = ActionResult<undefined>;

const BUSINESS_EXISTS: ActionResultState = {
  ok: false,
  code: "BUSINESS_EXISTS",
  message: "Seu negócio já está configurado. Edite os dados em Configurações.",
};

// Setup only: refuses (without writing) when the owner already has a business,
// so returning to /dashboard/setup can never overwrite name, slug or phone.
export async function createBusiness(
  _prev: ActionResultState,
  formData: FormData,
): Promise<ActionResultState> {
  const parsed = parseBusinessForm(formData);
  if (!parsed.ok) return parsed.error;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", message: "Faça login para continuar." };

  const existing = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (existing.data?.id) return BUSINESS_EXISTS;

  const limitError = checkBookingWindowLimit(parsed.data, undefined);
  if (limitError) return limitError;

  // The owner_id FK needs a profile row.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: parsed.data.name }, { onConflict: "id" });
  if (profileError) return mapDbError(profileError);

  const { error } = await supabase
    .from("businesses")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      phone: parsed.data.phone,
      slot_interval_minutes: parsed.data.slotIntervalMinutes,
      min_notice_minutes: parsed.data.minNoticeMinutes,
      booking_window_days: parsed.data.bookingWindowDays,
      timezone: parsed.data.timezone,
      description: parsed.data.description ?? null,
    });

  // businesses.owner_id is unique: a concurrent setup created the business first.
  if (error?.code === "23505" && error.message.includes("owner_id")) return BUSINESS_EXISTS;
  if (error) return mapDbError(error);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: undefined };
}

// Configurações only: edits the owner's business and never creates one.
export async function updateBusiness(
  _prev: ActionResultState,
  formData: FormData,
): Promise<ActionResultState> {
  const parsed = parseBusinessForm(formData);
  if (!parsed.ok) return parsed.error;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", message: "Faça login para continuar." };

  const existing = await supabase
    .from("businesses")
    .select("id, plan")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!existing.data?.id) {
    return { ok: false, code: "BUSINESS_NOT_FOUND", message: "Configure seu negócio antes de editá-lo." };
  }

  const limitError = checkBookingWindowLimit(parsed.data, existing.data.plan);
  if (limitError) return limitError;

  const { count: futureBookings } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("business_id", existing.data.id)
    .eq("status", "confirmed")
    .gt("start_at", new Date().toISOString());
  const current = await supabase.from("businesses").select("timezone").eq("id", existing.data.id).single();
  if (current.data?.timezone !== parsed.data.timezone && (futureBookings ?? 0) > 0) {
    return {
      ok: false,
      code: "TIMEZONE_HAS_BOOKINGS",
      message: "O fuso horário não pode ser alterado enquanto houver reservas futuras. Cancele essas reservas ou aguarde até que aconteçam.",
      fieldErrors: { timezone: ["Há reservas futuras neste negócio."] },
    };
  }
  const { error } = await supabase
    .from("businesses")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      phone: parsed.data.phone,
      slot_interval_minutes: parsed.data.slotIntervalMinutes,
      min_notice_minutes: parsed.data.minNoticeMinutes,
      booking_window_days: parsed.data.bookingWindowDays,
      description: parsed.data.description ?? null,
      timezone: parsed.data.timezone,
    })
    .eq("id", existing.data.id)
    .eq("owner_id", user.id);

  if (error) return mapDbError(error);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: undefined };
}

function parseBusinessForm(
  formData: FormData,
): { ok: true; data: ParsedBusiness } | { ok: false; error: ActionResultState } {
  const payload: BusinessPayload = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? ""),
    slotIntervalMinutes: Number(formData.get("slotIntervalMinutes") ?? 30),
    minNoticeMinutes: Number(formData.get("minNoticeMinutes") ?? 120),
    bookingWindowDays: Number(formData.get("bookingWindowDays") ?? 60),
    timezone: String(formData.get("timezone") ?? "America/Sao_Paulo").trim(),
    description: String(formData.get("description") ?? "") || null,
  };

  const parsed = businessSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        ok: false,
        code: "VALIDATION",
        message: "Revise os campos destacados.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  if (isReservedSlug(parsed.data.slug)) {
    return {
      ok: false,
      error: {
        ok: false,
        code: "SLUG_RESERVED",
        message: RESERVED_SLUG_MESSAGE,
        fieldErrors: { slug: [RESERVED_SLUG_MESSAGE] },
      },
    };
  }

  return { ok: true, data: parsed.data };
}

function checkBookingWindowLimit(
  business: ParsedBusiness,
  plan: Plan | null | undefined,
): ActionResultState | null {
  const bookingWindowLimitDays = getBookingWindowLimitDays(plan);
  if (business.bookingWindowDays <= bookingWindowLimitDays) return null;
  return {
    ok: false,
    code: "VALIDATION",
    message: "A janela de reservas excede o limite do seu plano.",
    fieldErrors: {
      bookingWindowDays: [`O limite do seu plano é de ${bookingWindowLimitDays} dias.`],
    },
  };
}

function mapDbError(error: { code?: string; message: string }): ActionResultState {
  if (error.code === "23505") {
    // Shown next to the slug field; the footer only points there.
    return {
      ok: false,
      code: "SLUG_TAKEN",
      message: "Revise os campos destacados.",
      fieldErrors: { slug: ["Este endereço já está em uso. Escolha outro."] },
    };
  }
  // public.reject_reserved_business_slug: the database copy of RESERVED_SLUGS.
  if (error.message.includes("BUSINESS_SLUG_RESERVED")) {
    return {
      ok: false,
      code: "SLUG_RESERVED",
      message: RESERVED_SLUG_MESSAGE,
      fieldErrors: { slug: [RESERVED_SLUG_MESSAGE] },
    };
  }
  return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar. Tente novamente." };
}

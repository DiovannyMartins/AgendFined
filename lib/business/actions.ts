"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { businessSchema } from "@/lib/validation/schemas";
import { getBookingWindowLimitDays } from "@/lib/plan/plan";
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

export type ActionResultState = ActionResult<undefined>;

export async function upsertBusiness(
  _prev: ActionResultState,
  formData: FormData,
): Promise<ActionResultState> {
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
      code: "VALIDATION",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (isReservedSlug(parsed.data.slug)) {
    return {
      ok: false,
      code: "SLUG_RESERVED",
      message: RESERVED_SLUG_MESSAGE,
      fieldErrors: { slug: [RESERVED_SLUG_MESSAGE] },
    };
  }

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

  const bookingWindowLimitDays = getBookingWindowLimitDays(existing.data?.plan);
  if (parsed.data.bookingWindowDays > bookingWindowLimitDays) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "A janela de reservas excede o limite do seu plano.",
      fieldErrors: {
        bookingWindowDays: [`O limite do seu plano é de ${bookingWindowLimitDays} dias.`],
      },
    };
  }

  if (existing.data?.id) {
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
        message: "Cancele ou conclua as reservas futuras antes de alterar o fuso horário do negócio.",
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

  // Create business (must also create a profile row if absent for owner_id FK).
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

  if (error) return mapDbError(error);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, data: undefined };
}

function mapDbError(error: { code?: string; message: string }): ActionResultState {
  if (error.code === "23505") {
    return { ok: false, code: "SLUG_TAKEN", message: "Este endereço já está em uso." };
  }
  return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar. Tente novamente." };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serviceSchema } from "@/lib/validation/schemas";
import { getCurrentBusiness } from "@/lib/business/queries";
import type { ActionResult } from "@/lib/business/actions";

export type { ActionResult };

type ServicePayload = {
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents: number;
};

function parseService(formData: FormData): ServicePayload {
  const price = String(formData.get("price") ?? "").trim();
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    durationMinutes: Number(formData.get("durationMinutes") ?? 0),
    priceCents: price ? Math.round(Number(price) * 100) : 0,
  };
}

export async function createService(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const payload = parseService(formData);
  const parsed = serviceSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    business_id: business.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    duration_minutes: parsed.data.durationMinutes,
    price_cents: parsed.data.priceCents,
  });

  if (error) {
    return { ok: false, code: "DB_ERROR", message: "Não foi possível salvar o serviço." };
  }
  revalidatePath("/dashboard/servicos");
  return { ok: true, data: undefined };
}

export async function updateService(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, code: "VALIDATION", message: "Serviço inválido." };

  const parsed = serviceSchema.safeParse(parseService(formData));
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const supabase = await createClient();
  const { error, data: updated } = await supabase
    .from("services")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      duration_minutes: parsed.data.durationMinutes,
      price_cents: parsed.data.priceCents,
    })
    .eq("id", id)
    .eq("business_id", business.id)
    .select();

  if (error) {
    return { ok: false, code: "FORBIDDEN", message: "Você não pode editar este serviço." };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: "Serviço não encontrado." };
  }
  revalidatePath("/dashboard/servicos");
  return { ok: true, data: undefined };
}

export async function toggleService(id: string, isActive: boolean): Promise<ActionResult> {
  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const supabase = await createClient();
  const { error, data } = await supabase
    .from("services")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("business_id", business.id)
    .select("id");

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível atualizar o serviço." };
  if (!data?.length) return { ok: false, code: "NOT_FOUND", message: "Serviço não encontrado." };

  revalidatePath("/dashboard/servicos");
  return { ok: true, data: undefined };
}

export async function deleteService(id: string): Promise<ActionResult> {
  const business = await getCurrentBusiness("editor");
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };

  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("delete_service_if_unused", {
    p_business_id: business.id,
    p_service_id: id,
    p_now: new Date().toISOString(),
  });

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível excluir o serviço." };
  if (result === "HAS_SCHEDULED_BOOKINGS") {
    return {
      ok: false,
      code: "HAS_SCHEDULED_BOOKINGS",
      message:
        "Este serviço possui reservas agendadas e não pode ser excluído. Cancele ou conclua as reservas agendadas antes de excluir.",
    };
  }
  if (result !== "DELETED") return { ok: false, code: "NOT_FOUND", message: "Serviço não encontrado." };
  revalidatePath("/dashboard/servicos");
  return { ok: true, data: undefined };
}

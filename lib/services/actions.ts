"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serviceSchema } from "@/lib/validation/schemas";
import { parsePriceToCents } from "@/lib/format/currency";
import { getCurrentBusiness } from "@/lib/business/queries";
import { ACCESS_REQUIRED_MESSAGE, assertAccess } from "@/lib/plan/access";
import type { ActionResult } from "@/lib/business/actions";

export type { ActionResult };

// A suspended negócio (ADR 0013) keeps its data read-only; RLS refuses the
// write too.
const ACCESS_REQUIRED: ActionResult = { ok: false, code: "ACCESS_REQUIRED", message: ACCESS_REQUIRED_MESSAGE };

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
    // "49,90" and "49.90" are both 4990; an unparseable price becomes NaN so
    // serviceSchema rejects it instead of storing a wrong amount.
    priceCents: price ? (parsePriceToCents(price) ?? Number.NaN) : 0,
  };
}

const DUPLICATE_NAME: ActionResult = {
  ok: false,
  code: "DUPLICATE_NAME",
  message: "Já existe um serviço com esse nome.",
  fieldErrors: { name: ["Já existe um serviço com esse nome. Use um nome diferente."] },
};

// Same name regardless of case and repeated spaces ("Corte" and " corte ").
function serviceNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

// Two serviços with the same name look identical in the public select, so a
// name another serviço of the negócio already uses is refused.
async function isServiceNameTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const { data } = await supabase.from("services").select("id, name").eq("business_id", businessId);
  const key = serviceNameKey(name);
  return (data ?? []).some((service) => service.id !== exceptId && serviceNameKey(service.name) === key);
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

  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };
  if (!assertAccess(business).ok) return ACCESS_REQUIRED;

  const supabase = await createClient();
  if (await isServiceNameTaken(supabase, business.id, parsed.data.name)) return DUPLICATE_NAME;

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

  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };
  if (!assertAccess(business).ok) return ACCESS_REQUIRED;

  const supabase = await createClient();
  if (await isServiceNameTaken(supabase, business.id, parsed.data.name, id)) return DUPLICATE_NAME;

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
  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };
  if (!assertAccess(business).ok) return ACCESS_REQUIRED;

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
  const business = await getCurrentBusiness();
  if (!business) return { ok: false, code: "NO_BUSINESS", message: "Configure seu negócio primeiro." };
  if (!assertAccess(business).ok) return ACCESS_REQUIRED;

  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("delete_service_if_unused", {
    p_business_id: business.id,
    p_service_id: id,
    p_now: new Date().toISOString(),
  });

  if (error) return { ok: false, code: "DB_ERROR", message: "Não foi possível excluir o serviço." };
  if (result === "BUSINESS_SUSPENDED") return ACCESS_REQUIRED;
  if (result === "HAS_SCHEDULED_BOOKINGS") {
    return {
      ok: false,
      code: "HAS_SCHEDULED_BOOKINGS",
      message:
        "Este serviço possui reservas agendadas e não pode ser excluído. Cancele essas reservas ou aguarde até que aconteçam; para tirá-lo da página pública agora, desative o serviço.",
    };
  }
  if (result !== "DELETED") return { ok: false, code: "NOT_FOUND", message: "Serviço não encontrado." };
  revalidatePath("/dashboard/servicos");
  return { ok: true, data: undefined };
}

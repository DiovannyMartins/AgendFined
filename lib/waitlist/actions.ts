"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import { assertProPlan } from "@/lib/plan/plan";
import { classifyOperationalError } from "@/lib/typesafe/judgments";

// Server actions for the waitlist management dashboard (issue #22, ADR 0008).
// Managing the waitlist is a PROFISSIONAL feature, so both actions gate on the
// business plan first (fail-closed) and only then hand off to the owner-scoped
// RPCs. The public join (`joinWaitlist` in lib/booking/actions.ts) is untouched
// and stays free.

export type WaitlistActionResult = { ok: boolean; message?: string; publicCode?: string };

async function requireProBusiness(): Promise<{ ok: true } | { ok: false; message: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { ok: false, message: "Configure seu negócio primeiro." };
  const gate = assertProPlan(business);
  if (!gate.ok) {
    return { ok: false, message: "A gestão da lista de espera é exclusiva do plano PROFISSIONAL." };
  }
  return { ok: true };
}

export async function notifyWaitlistEntry(
  _prev: WaitlistActionResult,
  formData: FormData,
): Promise<WaitlistActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Entrada inválida." };

  const gate = await requireProBusiness();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { error } = await supabase.rpc("notify_waitlist_entry", { p_entry_id: id });
  if (error) {
    const msg = String(error.message ?? "");
    if (/WAITLIST_PRO_REQUIRED/i.test(msg)) {
      return { ok: false, message: "A gestão da lista de espera é exclusiva do plano PROFISSIONAL." };
    }
    if (/WAITLIST_NOT_OWNER|WAITLIST_ENTRY_NOT_FOUND/i.test(msg)) {
      return { ok: false, message: "Entrada não encontrada." };
    }
    if (/WAITLIST_ALREADY_CONVERTED|WAITLIST_CANCELLED/i.test(msg)) {
      return { ok: false, message: "Essa entrada não pode ser notificada." };
    }
    const judgment = await classifyOperationalError("notify_waitlist_entry", msg);
    if (judgment?.category === "not_found" && judgment.confidence >= 0.8) {
      return { ok: false, message: "Entrada não encontrada." };
    }
    if (judgment?.category === "invalid_state" && judgment.confidence >= 0.8) {
      return { ok: false, message: "Essa entrada não pode ser notificada." };
    }
    return { ok: false, message: "Não foi possível notificar. Tente novamente." };
  }

  revalidatePath("/dashboard/lista-de-espera");
  return { ok: true };
}

export async function convertWaitlistEntry(
  _prev: WaitlistActionResult,
  formData: FormData,
): Promise<WaitlistActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Entrada inválida." };

  const gate = await requireProBusiness();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_waitlist_entry", { p_entry_id: id });
  if (error) {
    const msg = String(error.message ?? "");
    if (/WAITLIST_PRO_REQUIRED/i.test(msg)) {
      return { ok: false, message: "A gestão da lista de espera é exclusiva do plano PROFISSIONAL." };
    }
    if (/WAITLIST_NOT_OWNER|WAITLIST_ENTRY_NOT_FOUND/i.test(msg)) {
      return { ok: false, message: "Entrada não encontrada." };
    }
    if (/WAITLIST_ALREADY_CONVERTED|WAITLIST_CANCELLED/i.test(msg)) {
      return { ok: false, message: "Essa entrada não pode ser convertida." };
    }
    if (/WAITLIST_PAST_SLOT/i.test(msg)) {
      return { ok: false, message: "O horário já passou e não pode ser convertido." };
    }
    if (/bookings_no_overlap|overlap|23P01|SLOT/i.test(msg)) {
      return { ok: false, message: "Esse horário acabou de ser reservado por outra pessoa." };
    }
    const judgment = await classifyOperationalError("convert_waitlist_entry", msg);
    if (judgment?.category === "not_found" && judgment.confidence >= 0.8) {
      return { ok: false, message: "Entrada não encontrada." };
    }
    if (judgment?.category === "invalid_state" && judgment.confidence >= 0.8) {
      return { ok: false, message: "Essa entrada não pode ser convertida." };
    }
    if (judgment?.category === "slot_conflict" && judgment.confidence >= 0.8) {
      return { ok: false, message: "Esse horário acabou de ser reservado por outra pessoa." };
    }
    return { ok: false, message: "Não foi possível converter. Tente novamente." };
  }

  revalidatePath("/dashboard/lista-de-espera");
  revalidatePath("/dashboard/agenda");
  return { ok: true, publicCode: data?.public_code };
}

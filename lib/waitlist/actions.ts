"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import { assertProPlan } from "@/lib/plan/plan";
import { classifyOperationalError } from "@/lib/bookings/classification";
import { generateCancelToken, hashCancelToken } from "@/lib/bookings/cancel";
import { buildPrivateConfirmationPath, buildPrivateConfirmationUrl } from "@/lib/bookings/private-confirmation";
import { buildPublicBookingUrl } from "@/lib/bookings/public-booking-url";
import { sendBookingConfirmationEmail } from "@/lib/email/booking-confirmation";
import { sendWaitlistSlotFreedEmail } from "@/lib/email/waitlist-slot-freed";
import { spendOwnerEmail } from "@/lib/email/owner-email-budget";
import { resolveAppOrigin } from "@/lib/app-origin";

// Server actions for the waitlist management dashboard (issue #22, ADR 0008).
// Managing the waitlist is a PROFISSIONAL feature, so both actions gate on the
// business plan first (fail-closed) and only then hand off to the owner-scoped
// RPCs. The public join (`joinWaitlist` in lib/booking/actions.ts) is untouched
// and stays free.
//
// Once the RPC succeeds, both actions reach the cliente by e-mail (#152):
// notifying sends "o horário ficou livre" with the public page link, and
// converting sends the same confirmação as a public reserva, carrying the only
// copy of the private cancellation link (ADR 0005). Delivery is best effort: a
// cliente without e-mail, or a failed send, never undoes the transition; the
// message tells the dono to reach the cliente another way.

export type WaitlistActionResult = {
  ok: boolean;
  message?: string;
  publicCode?: string;
  cancellationUrl?: string;
};

type ProBusiness = NonNullable<Awaited<ReturnType<typeof getCurrentBusiness>>>;

async function requireProBusiness(): Promise<
  { ok: true; business: ProBusiness } | { ok: false; message: string }
> {
  const business = await getCurrentBusiness();
  if (!business) return { ok: false, message: "Configure seu negócio primeiro." };
  const gate = assertProPlan(business);
  if (!gate.ok) {
    return { ok: false, message: "A gestão da lista de espera é exclusiva do plano PROFISSIONAL." };
  }
  return { ok: true, business };
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
  const { data: entry, error } = await supabase.rpc("notify_waitlist_entry", { p_entry_id: id });
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

  if (!entry.customer_email) {
    return { ok: true, message: "Sem e-mail cadastrado. Avise o cliente pelo telefone ou WhatsApp." };
  }

  const { business } = gate;
  const emailNotSent = "Não foi possível enviar o e-mail. Avise o cliente pelo telefone ou WhatsApp.";
  if (!await spendOwnerEmail(business, entry.customer_email, "waitlist_slot_freed")) return { ok: true, message: emailNotSent };
  // The owner's own catálogo, read under RLS like the dashboard list.
  const { data: service } = await supabase
    .from("services")
    .select("name")
    .eq("id", entry.service_id)
    .eq("business_id", business.id)
    .maybeSingle();
  const emailResult = await sendWaitlistSlotFreedEmail({
    customerName: entry.customer_name,
    customerEmail: entry.customer_email,
    businessName: business.name,
    businessPhone: business.phone,
    serviceName: service?.name ?? "Serviço",
    startAt: entry.start_at,
    timezone: business.timezone,
    bookingUrl: buildPublicBookingUrl(resolveAppOrigin(), business.slug),
  });
  if (!emailResult.sent) {
    console.error("waitlist_slot_freed_email_failed", { entryId: id, reason: emailResult.reason });
    return { ok: true, message: emailNotSent };
  }
  return { ok: true, message: `Aviso enviado por e-mail para ${entry.customer_email}.` };
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
  const cancelToken = generateCancelToken();
  const { data, error } = await supabase.rpc("convert_waitlist_entry", {
    p_entry_id: id,
    p_cancel_token_hash: hashCancelToken(cancelToken),
  });
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
      return { ok: false, message: "Esse horário ainda está ocupado. Converta quando ele for liberado." };
    }
    const judgment = await classifyOperationalError("convert_waitlist_entry", msg);
    if (judgment?.category === "not_found" && judgment.confidence >= 0.8) {
      return { ok: false, message: "Entrada não encontrada." };
    }
    if (judgment?.category === "invalid_state" && judgment.confidence >= 0.8) {
      return { ok: false, message: "Essa entrada não pode ser convertida." };
    }
    if (judgment?.category === "slot_conflict" && judgment.confidence >= 0.8) {
      return { ok: false, message: "Esse horário ainda está ocupado. Converta quando ele for liberado." };
    }
    return { ok: false, message: "Não foi possível converter. Tente novamente." };
  }

  revalidatePath("/dashboard/lista-de-espera");
  revalidatePath("/dashboard/agenda");

  const { business } = gate;
  const converted = {
    ok: true,
    publicCode: data.public_code,
    cancellationUrl: buildPrivateConfirmationPath(business.slug, data.public_code, cancelToken),
  };

  if (!data.customer_email_snapshot) {
    return { ...converted, message: "Sem e-mail cadastrado. Envie ao cliente o link da confirmação privada." };
  }

  const emailNotSent = "Não foi possível enviar o e-mail. Envie ao cliente o link da confirmação privada.";
  if (!await spendOwnerEmail(business, data.customer_email_snapshot, "waitlist_conversion")) return { ...converted, message: emailNotSent };

  const emailResult = await sendBookingConfirmationEmail({
    customerName: data.customer_name_snapshot,
    customerEmail: data.customer_email_snapshot,
    businessName: business.name,
    serviceName: data.service_name_snapshot,
    startAt: data.start_at,
    timezone: business.timezone,
    publicCode: data.public_code,
    businessPhone: business.phone,
    confirmationUrl: buildPrivateConfirmationUrl(resolveAppOrigin(), business.slug, data.public_code, cancelToken),
  });
  if (!emailResult.sent) {
    console.error("booking_confirmation_email_failed", { bookingId: data.id, reason: emailResult.reason });
    return { ...converted, message: emailNotSent };
  }
  return { ...converted, message: `Confirmação enviada por e-mail para ${data.customer_email_snapshot}.` };
}

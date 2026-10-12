"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProPlan } from "@/lib/plan/plan";
import { decryptGoogleToken } from "./oauth";
import { syncGoogleCalendarForBusiness } from "./sync";

export type GoogleCalendarActionState = { ok: boolean; message?: string };

export async function syncGoogleCalendarNow(
  _prev: GoogleCalendarActionState,
): Promise<GoogleCalendarActionState> {
  void _prev;
  const business = await getCurrentBusiness();
  if (!business) return { ok: false, message: "Configure seu negócio primeiro." };
  if (!isProPlan(business.plan)) return { ok: false, message: "A sincronização está disponível no plano PROFISSIONAL." };
  try {
    await syncGoogleCalendarForBusiness(business.id);
    revalidatePath("/dashboard/configuracoes");
    revalidatePath("/dashboard/agenda");
    return { ok: true, message: "Agenda sincronizada com o Google Calendar." };
  } catch {
    return { ok: false, message: "Não foi possível sincronizar agora. Reconecte o Google Calendar se o problema continuar." };
  }
}

export async function disconnectGoogleCalendar(
  _prev: GoogleCalendarActionState,
): Promise<GoogleCalendarActionState> {
  void _prev;
  const business = await getCurrentBusiness();
  if (!business) return { ok: false, message: "Configure seu negócio primeiro." };
  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("google_calendar_connections")
    .select("id,calendar_id,refresh_token_ciphertext")
    .eq("business_id", business.id)
    .maybeSingle();
  if (!connection) return { ok: true, message: "Nenhuma conexão encontrada." };

  // Best effort cleanup: the local connection is always removed even if Google
  // has already revoked the token or a previously-created event disappeared.
  try {
    const refreshToken = decryptGoogleToken(connection.refresh_token_ciphertext);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    // Revocation is not allowed to strand the local disconnect action.
  }

  const { error } = await admin.from("google_calendar_connections").delete().eq("id", connection.id);
  if (error) return { ok: false, message: "Não foi possível desconectar o Google Calendar." };
  revalidatePath("/dashboard/configuracoes");
  return { ok: true, message: "Google Calendar desconectado." };
}

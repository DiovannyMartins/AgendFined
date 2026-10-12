import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type GoogleCalendarConnectionStatus = {
  googleEmail: string;
  calendarId: string;
  lastSyncAt: string | null;
  lastError: string | null;
} | null;

export async function getGoogleCalendarConnectionStatus(businessId: string): Promise<GoogleCalendarConnectionStatus> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_calendar_connections")
    .select("google_email,calendar_id,last_sync_at,last_error")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error("GOOGLE_CALENDAR_CONNECTION_LOAD_FAILED");
  if (!data) return null;
  return {
    googleEmail: data.google_email,
    calendarId: data.calendar_id,
    lastSyncAt: data.last_sync_at,
    lastError: data.last_error,
  };
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GOOGLE_CALENDAR_REAUTH_REQUIRED } from "./oauth";

export type GoogleCalendarConnectionStatus = {
  googleEmail: string;
  calendarId: string;
  calendarTimezone: string | null;
  businessTimezone: string;
  timezoneMismatch: boolean;
  lastSyncAt: string | null;
  // Only whether the last sync failed: the stored error text stays server-side.
  syncFailed: boolean;
  // Google no longer authorizes the calendar; only reconnecting fixes it.
  needsReconnect: boolean;
} | null;

export async function getGoogleCalendarConnectionStatus(businessId: string, businessTimezone: string): Promise<GoogleCalendarConnectionStatus> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_calendar_connections")
    .select("google_email,calendar_id,calendar_timezone,last_sync_at,last_error")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error("GOOGLE_CALENDAR_CONNECTION_LOAD_FAILED");
  if (!data) return null;
  return {
    googleEmail: data.google_email,
    calendarId: data.calendar_id,
    calendarTimezone: data.calendar_timezone,
    businessTimezone,
    timezoneMismatch: Boolean(data.calendar_timezone && data.calendar_timezone !== businessTimezone),
    lastSyncAt: data.last_sync_at,
    syncFailed: Boolean(data.last_error),
    needsReconnect: data.last_error === GOOGLE_CALENDAR_REAUTH_REQUIRED,
  };
}

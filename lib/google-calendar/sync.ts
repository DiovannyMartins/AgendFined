import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GOOGLE_CALENDAR_REAUTH_REQUIRED,
  decryptGoogleToken,
  encryptGoogleToken,
  refreshGoogleAccessToken,
} from "./oauth";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { isProPlan } from "@/lib/plan/plan";
import { formatPhoneBR } from "@/lib/format/phone";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const REFRESH_MARGIN_MS = 60_000;
const SYNC_LOOKBACK_MS = 60 * 60 * 1000;

type BookingForCalendar = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  service_name_snapshot: string;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  customer_note: string | null;
};

type Connection = {
  id: string;
  business_id: string;
  google_email: string;
  calendar_id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string;
  calendar_timezone: string | null;
  business_timezone: string;
};

function googleEventId(bookingId: string): string {
  return `agendfined${createHash("sha256").update(bookingId).digest("hex").slice(0, 40)}`;
}

function calendarEvent(booking: BookingForCalendar, timezone: string) {
  const note = booking.customer_note?.trim();
  // The phone lets the dono call the cliente straight from the event (#149).
  const phone = booking.customer_phone_snapshot?.trim();
  return {
    id: googleEventId(booking.id),
    summary: `${booking.service_name_snapshot} — ${booking.customer_name_snapshot}`,
    description: [
      "Criado pelo AgendFined",
      phone ? `Telefone: ${formatPhoneBR(phone)}` : "",
      note ? `Observação: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: booking.start_at, timeZone: timezone },
    end: { dateTime: booking.end_at, timeZone: timezone },
    extendedProperties: {
      private: { agendfined: "true", agendfinedBookingId: booking.id },
    },
  };
}

async function googleRequest<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  let data: T | null = null;
  try {
    data = body ? JSON.parse(body) as T : null;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function loadConnection(businessId: string): Promise<Connection | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_calendar_connections")
    .select("id,business_id,google_email,calendar_id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,calendar_timezone")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error("GOOGLE_CALENDAR_CONNECTION_LOAD_FAILED");
  if (!data) return null;
  const { data: business, error: businessError } = await admin
    .from("businesses")
    .select("timezone,plan")
    .eq("id", businessId)
    .single();
  if (businessError) throw new Error("GOOGLE_CALENDAR_BUSINESS_LOAD_FAILED");
  if (!business || !isProPlan(business.plan)) return null;
  return { ...data, business_timezone: business?.timezone ?? APP_TIMEZONE };
}

async function readCalendarTimezone(accessToken: string, calendarId: string): Promise<string | null> {
  const response = await googleRequest<{ timeZone?: string }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}`,
  );
  return response.status >= 200 && response.status < 300 && typeof response.data?.timeZone === "string"
    ? response.data.timeZone
    : null;
}

async function accessTokenFor(connection: Connection): Promise<string> {
  const admin = createAdminClient();
  if (new Date(connection.token_expires_at).getTime() > Date.now() + REFRESH_MARGIN_MS) {
    return decryptGoogleToken(connection.access_token_ciphertext);
  }

  const tokens = await refreshGoogleAccessToken(decryptGoogleToken(connection.refresh_token_ciphertext));
  const { error } = await admin
    .from("google_calendar_connections")
    .update({
      access_token_ciphertext: encryptGoogleToken(tokens.access_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      last_error: null,
    })
    .eq("id", connection.id);
  if (error) throw new Error("GOOGLE_CALENDAR_TOKEN_SAVE_FAILED");
  return tokens.access_token;
}

type CalendarAction = "upsert" | "delete" | "keep";

// Only a missing or cancelled booking leaves the owner's calendar. Completed
// and no-show bookings record what happened, so their event stays untouched,
// and so does the event of a confirmed booking that has already ended.
function calendarActionFor(booking: Pick<BookingForCalendar, "status" | "end_at"> | null): CalendarAction {
  if (!booking || booking.status === "cancelled") return "delete";
  if (booking.status === "confirmed" && new Date(booking.end_at).getTime() >= Date.now() - SYNC_LOOKBACK_MS) return "upsert";
  return "keep";
}

function eventsPath(calendarId: string): string {
  return `/calendars/${encodeURIComponent(calendarId)}/events`;
}

async function upsertEvent(accessToken: string, calendarId: string, booking: BookingForCalendar, timezone: string): Promise<void> {
  const event = calendarEvent(booking, timezone);
  const updated = await googleRequest(accessToken, `${eventsPath(calendarId)}/${encodeURIComponent(event.id)}`, { method: "PUT", body: JSON.stringify(event) });
  if (updated.status === 404) {
    const inserted = await googleRequest(accessToken, eventsPath(calendarId), { method: "POST", body: JSON.stringify(event) });
    if (inserted.status < 200 || inserted.status >= 300) throw new Error("GOOGLE_CALENDAR_EVENT_INSERT_FAILED");
  } else if (updated.status < 200 || updated.status >= 300) {
    throw new Error("GOOGLE_CALENDAR_EVENT_UPDATE_FAILED");
  }
}

async function deleteEvent(accessToken: string, calendarId: string, bookingId: string): Promise<boolean> {
  const response = await googleRequest(accessToken, `${eventsPath(calendarId)}/${encodeURIComponent(googleEventId(bookingId))}`, { method: "DELETE" });
  if (response.status !== 204 && response.status !== 404) throw new Error("GOOGLE_CALENDAR_EVENT_DELETE_FAILED");
  return response.status === 204;
}

// Settings shows last_error to the owner, so every failed sync records it,
// whether it came from a single booking or from the batch.
async function recordSyncError(connectionId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "GOOGLE_CALENDAR_SYNC_FAILED";
  await createAdminClient().from("google_calendar_connections").update({ last_error: message }).eq("id", connectionId);
}

export async function syncGoogleCalendarBooking(businessId: string, bookingId: string): Promise<void> {
  const connection = await loadConnection(businessId);
  if (!connection) return;
  const admin = createAdminClient();
  try {
    const { data: booking, error } = await admin
      .from("bookings")
      .select("id,start_at,end_at,status,service_name_snapshot,customer_name_snapshot,customer_phone_snapshot,customer_note")
      .eq("id", bookingId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (error) throw new Error("GOOGLE_CALENDAR_BOOKING_LOAD_FAILED");

    const action = calendarActionFor(booking);
    if (action === "keep") return;
    const accessToken = await accessTokenFor(connection);
    if (!booking || action === "delete") {
      await deleteEvent(accessToken, connection.calendar_id, bookingId);
      return;
    }
    await upsertEvent(accessToken, connection.calendar_id, booking, connection.business_timezone);
  } catch (error) {
    await recordSyncError(connection.id, error);
    throw error;
  }
}

export async function syncGoogleCalendarForBusiness(businessId: string): Promise<{ synced: number; deleted: number }> {
  const connection = await loadConnection(businessId);
  if (!connection) return { synced: 0, deleted: 0 };
  const admin = createAdminClient();
  try {
    const accessToken = await accessTokenFor(connection);
    const calendarTimezone = await readCalendarTimezone(accessToken, connection.calendar_id);
    if (calendarTimezone && calendarTimezone !== connection.calendar_timezone) {
      const { error: timezoneError } = await admin
        .from("google_calendar_connections")
        .update({ calendar_timezone: calendarTimezone })
        .eq("id", connection.id);
      if (timezoneError) throw new Error("GOOGLE_CALENDAR_TIMEZONE_SAVE_FAILED");
      connection.calendar_timezone = calendarTimezone;
    }
    const [{ data: upcoming, error: upcomingError }, { data: cancelled, error: cancelledError }] = await Promise.all([
      admin.from("bookings").select("id,start_at,end_at,status,service_name_snapshot,customer_name_snapshot,customer_phone_snapshot,customer_note")
        .eq("business_id", businessId).eq("status", "confirmed").gte("end_at", new Date(Date.now() - SYNC_LOOKBACK_MS).toISOString()).order("start_at").limit(250),
      admin.from("bookings").select("id,status,end_at").eq("business_id", businessId).eq("status", "cancelled").gte("end_at", new Date(Date.now() - SYNC_LOOKBACK_MS).toISOString()).limit(250),
    ]);
    if (upcomingError || cancelledError) throw new Error("GOOGLE_CALENDAR_BOOKINGS_LOAD_FAILED");

    let synced = 0;
    for (const booking of (upcoming ?? []) as BookingForCalendar[]) {
      if (calendarActionFor(booking) !== "upsert") continue;
      await upsertEvent(accessToken, connection.calendar_id, booking, connection.business_timezone);
      synced += 1;
    }

    let deleted = 0;
    for (const booking of cancelled ?? []) {
      if (calendarActionFor(booking) !== "delete") continue;
      if (await deleteEvent(accessToken, connection.calendar_id, booking.id)) deleted += 1;
    }

    const { error: updateError } = await admin.from("google_calendar_connections").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", connection.id);
    if (updateError) throw new Error("GOOGLE_CALENDAR_SYNC_STATUS_SAVE_FAILED");
    return { synced, deleted };
  } catch (error) {
    await recordSyncError(connection.id, error);
    throw error;
  }
}

export async function runGoogleCalendarSyncBatch(): Promise<{ connections: number; synced: number; deleted: number; failed: number }> {
  const admin = createAdminClient();
  // A connection waiting for the owner to reconnect would fail every run;
  // reconnecting clears last_error and brings it back into the batch.
  const { data: connections, error } = await admin.from("google_calendar_connections")
    .select("business_id,businesses!inner(plan)")
    .eq("businesses.plan", "pro")
    .or(`last_error.is.null,last_error.neq.${GOOGLE_CALENDAR_REAUTH_REQUIRED}`)
    .order("updated_at", { ascending: true }).limit(25);
  if (error) throw new Error("GOOGLE_CALENDAR_CONNECTIONS_LOAD_FAILED");
  let synced = 0;
  let deleted = 0;
  let failed = 0;
  for (const connection of connections ?? []) {
    try {
      const result = await syncGoogleCalendarForBusiness(connection.business_id);
      synced += result.synced;
      deleted += result.deleted;
    } catch {
      failed += 1;
    }
  }
  return { connections: connections?.length ?? 0, synced, deleted, failed };
}

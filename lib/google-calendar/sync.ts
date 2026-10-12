import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptGoogleToken,
  encryptGoogleToken,
  refreshGoogleAccessToken,
} from "./oauth";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const APP_TIMEZONE = "America/Sao_Paulo";
const REFRESH_MARGIN_MS = 60_000;

type BookingForCalendar = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  service_name_snapshot: string;
  customer_name_snapshot: string;
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
};

function googleEventId(bookingId: string): string {
  return `agendfined${createHash("sha256").update(bookingId).digest("hex").slice(0, 40)}`;
}

function calendarEvent(booking: BookingForCalendar) {
  const note = booking.customer_note?.trim();
  return {
    id: googleEventId(booking.id),
    summary: `${booking.service_name_snapshot} — ${booking.customer_name_snapshot}`,
    description: ["Criado pelo AgendFined", note ? `Observação: ${note}` : ""].filter(Boolean).join("\n"),
    start: { dateTime: booking.start_at, timeZone: APP_TIMEZONE },
    end: { dateTime: booking.end_at, timeZone: APP_TIMEZONE },
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
    .select("id,business_id,google_email,calendar_id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error("GOOGLE_CALENDAR_CONNECTION_LOAD_FAILED");
  return data;
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

function isSyncable(booking: BookingForCalendar): boolean {
  return booking.status === "confirmed" && new Date(booking.end_at).getTime() >= Date.now() - 60 * 60 * 1000;
}

export async function syncGoogleCalendarBooking(businessId: string, bookingId: string): Promise<void> {
  const connection = await loadConnection(businessId);
  if (!connection) return;
  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id,start_at,end_at,status,service_name_snapshot,customer_name_snapshot,customer_note")
    .eq("id", bookingId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error("GOOGLE_CALENDAR_BOOKING_LOAD_FAILED");

  const accessToken = await accessTokenFor(connection);
  const eventPath = `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(googleEventId(bookingId))}`;
  if (!booking || !isSyncable(booking)) {
    const deleted = await googleRequest(accessToken, eventPath, { method: "DELETE" });
    if (deleted.status !== 204 && deleted.status !== 404) throw new Error("GOOGLE_CALENDAR_EVENT_DELETE_FAILED");
    return;
  }

  const event = calendarEvent(booking);
  const updated = await googleRequest(accessToken, eventPath, { method: "PUT", body: JSON.stringify(event) });
  if (updated.status === 404) {
    const inserted = await googleRequest(accessToken, `/calendars/${encodeURIComponent(connection.calendar_id)}/events`, { method: "POST", body: JSON.stringify(event) });
    if (inserted.status < 200 || inserted.status >= 300) throw new Error("GOOGLE_CALENDAR_EVENT_INSERT_FAILED");
  } else if (updated.status < 200 || updated.status >= 300) {
    throw new Error("GOOGLE_CALENDAR_EVENT_UPDATE_FAILED");
  }
}

export async function syncGoogleCalendarForBusiness(businessId: string): Promise<{ synced: number; deleted: number }> {
  const connection = await loadConnection(businessId);
  if (!connection) return { synced: 0, deleted: 0 };
  const admin = createAdminClient();
  try {
    const accessToken = await accessTokenFor(connection);
    const [{ data: upcoming, error: upcomingError }, { data: cancelled, error: cancelledError }] = await Promise.all([
      admin.from("bookings").select("id,start_at,end_at,status,service_name_snapshot,customer_name_snapshot,customer_note")
        .eq("business_id", businessId).eq("status", "confirmed").gte("end_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()).order("start_at").limit(250),
      admin.from("bookings").select("id").eq("business_id", businessId).eq("status", "cancelled").gte("end_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()).limit(250),
    ]);
    if (upcomingError || cancelledError) throw new Error("GOOGLE_CALENDAR_BOOKINGS_LOAD_FAILED");

    let synced = 0;
    for (const booking of (upcoming ?? []) as BookingForCalendar[]) {
      const event = calendarEvent(booking);
      const path = `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(event.id)}`;
      const updated = await googleRequest(accessToken, path, { method: "PUT", body: JSON.stringify(event) });
      if (updated.status === 404) {
        const inserted = await googleRequest(accessToken, `/calendars/${encodeURIComponent(connection.calendar_id)}/events`, { method: "POST", body: JSON.stringify(event) });
        if (inserted.status < 200 || inserted.status >= 300) throw new Error("GOOGLE_CALENDAR_EVENT_INSERT_FAILED");
      } else if (updated.status < 200 || updated.status >= 300) {
        throw new Error("GOOGLE_CALENDAR_EVENT_UPDATE_FAILED");
      }
      synced += 1;
    }

    let deleted = 0;
    for (const booking of cancelled ?? []) {
      const path = `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(googleEventId(booking.id))}`;
      const response = await googleRequest(accessToken, path, { method: "DELETE" });
      if (response.status !== 204 && response.status !== 404) throw new Error("GOOGLE_CALENDAR_EVENT_DELETE_FAILED");
      if (response.status === 204) deleted += 1;
    }

    const { error: updateError } = await admin.from("google_calendar_connections").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", connection.id);
    if (updateError) throw new Error("GOOGLE_CALENDAR_SYNC_STATUS_SAVE_FAILED");
    return { synced, deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GOOGLE_CALENDAR_SYNC_FAILED";
    await admin.from("google_calendar_connections").update({ last_error: message }).eq("id", connection.id);
    throw error;
  }
}

export async function runGoogleCalendarSyncBatch(): Promise<{ connections: number; synced: number; deleted: number; failed: number }> {
  const admin = createAdminClient();
  const { data: connections, error } = await admin.from("google_calendar_connections").select("business_id").order("updated_at", { ascending: true }).limit(25);
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

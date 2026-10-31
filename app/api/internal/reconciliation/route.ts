import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runBoundedReconciliation } from "@/lib/billing/reconciliation-runner";
import { runPendingCheckoutRepricing } from "@/lib/billing/reprice-checkouts-runner";
import type { RepriceCheckoutsResult } from "@/lib/billing/reprice-checkouts";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceApiRateLimit, getClientIpFromHeaders } from "@/lib/booking/rate-limit";
import { runGoogleCalendarSyncBatch } from "@/lib/google-calendar/sync";
import { withNoStore } from "@/lib/http/no-store";

export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.RECONCILIATION_CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const allowed = await enforceApiRateLimit(createAdminClient(), getClientIpFromHeaders(request.headers), "reconciliation");
    if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "rate_limit_unavailable" }, { status: 503 });
  }
  const startedAt = Date.now();
  console.info(JSON.stringify({ event: "reconciliation_http_started" }));
  try {
    const reports = await runBoundedReconciliation();
    // Checkouts created before a price change are brought up to the current
    // price; a failure here is retried by the next run.
    let repricing: RepriceCheckoutsResult | null = null;
    try {
      repricing = await runPendingCheckoutRepricing();
    } catch {
      console.error(JSON.stringify({ event: "checkout_repricing_failed" }));
    }
    let calendarSync: { connections: number; synced: number; deleted: number; failed: number } | null = null;
    try {
      calendarSync = await runGoogleCalendarSyncBatch();
    } catch {
      console.error(JSON.stringify({ event: "google_calendar_sync_batch_failed" }));
    }
    const body = { ok: true, reportCount: reports.length, repricing, calendarSync, durationMs: Date.now() - startedAt };
    console.info(JSON.stringify({ event: "reconciliation_http_finished", ...body }));
    return NextResponse.json(body);
  } catch {
    console.error(JSON.stringify({ event: "reconciliation_http_failed", durationMs: Date.now() - startedAt }));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export const POST = withNoStore(run);

// Vercel Cron invokes functions with GET and supplies Authorization: Bearer <CRON_SECRET>.
export const GET = withNoStore(run);

import { NextResponse, type NextRequest } from "next/server";
import { runBoundedReconciliation } from "@/lib/billing/reconciliation-runner";

export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  const secret = process.env.RECONCILIATION_CRON_SECRET;
  const header = request.headers.get("authorization");
  return Boolean(secret && header === `Bearer ${secret}`);
}

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  console.info(JSON.stringify({ event: "reconciliation_http_started" }));
  try {
    const reports = await runBoundedReconciliation();
    const body = { ok: true, reportCount: reports.length, durationMs: Date.now() - startedAt };
    console.info(JSON.stringify({ event: "reconciliation_http_finished", ...body }));
    return NextResponse.json(body);
  } catch {
    console.error(JSON.stringify({ event: "reconciliation_http_failed", durationMs: Date.now() - startedAt }));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return run(request); }

// Vercel Cron invokes functions with GET and supplies Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) { return run(request); }

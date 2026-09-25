// Mercado Pago webhook receiver (issue #24). Mercado Pago POSTs a preapproval
// notification to this URL; the handler verifies the `x-signature` (HMAC-SHA256
// over `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, constant-time) and
// rejects anything that isn't legitimately from Mercado Pago. It then maps the
// preapproval status onto the plan lifecycle via `runMercadoPagoWebhook`
// (`authorized` -> Pro, `paused`/`cancelled` -> 7-day grace keeping Pro). The
// webhook secret is required; when unset the endpoint fails closed (503) so a
// misconfigured environment never accepts a notification.
import { NextResponse, type NextRequest } from "next/server";
import { verifyMercadoPagoWebhookSignature } from "@/lib/billing/webhook-signature";
import { runMercadoPagoWebhook } from "@/lib/billing/webhook-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceApiRateLimit, getClientIpFromHeaders } from "@/lib/booking/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const allowed = await enforceApiRateLimit(createAdminClient(), getClientIpFromHeaders(request.headers), "webhook");
    if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "rate_limit_unavailable" }, { status: 503 });
  }
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const dataId = request.nextUrl.searchParams.get("data.id");
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  let body: { type?: string; data?: { id?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (
    !verifyMercadoPagoWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
      secret,
    })
  ) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const type = body.type;
  // The signature is verified over the query `data.id`, so process that same id
  // (falling back to the body) rather than a different one.
  const id = dataId ?? body.data?.id;
  if (!type || !id) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let result;
  try {
    result = await runMercadoPagoWebhook({ type, dataId: id }, { accessToken });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: 502 });
  }
  return NextResponse.json({ ok: true, applied: result.applied });
}

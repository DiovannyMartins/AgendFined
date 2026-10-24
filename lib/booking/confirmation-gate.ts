import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONFIRMATION_RATE_LIMIT, enforceConfirmationRateLimit, getClientIpFromHeaders } from "@/lib/booking/rate-limit";
import { publicCodeSchema } from "@/lib/validation/schemas";

// The confirmation screen (/<slug>/confirmacao?code=…) spends the per-IP
// confirmation limiter here, in the proxy, because only a response returned
// before the page renders can carry 429/503: a page can only answer 404, 401
// or 403 on its own, and anything thrown to error.tsx becomes a 500 whose
// message only appears after hydration (#140, #179). The page itself no longer
// counts, so each opening is counted once.

const CONFIRMATION_PATH = /^\/[^/]+\/confirmacao\/?$/;

export type ConfirmationRefusal = "rate_limited" | "unavailable";

// Only page loads count: GET/HEAD, including the RSC request of a client-side
// navigation or refresh. A Server Action posted from the page (the
// cancellation) is not an opening of the confirmation and keeps its own limit.
export function isConfirmationOpening(request: Pick<NextRequest, "method" | "nextUrl" | "headers">): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    !request.headers.has("next-action") &&
    CONFIRMATION_PATH.test(request.nextUrl.pathname)
  );
}

// null lets the request through. A missing or malformed code is a 404 the page
// answers without touching the database, so it does not spend the limiter.
export async function checkConfirmationOpening(
  request: Pick<NextRequest, "method" | "nextUrl" | "headers">,
): Promise<ConfirmationRefusal | null> {
  if (!isConfirmationOpening(request)) return null;
  if (!publicCodeSchema.safeParse(request.nextUrl.searchParams.get("code") ?? "").success) return null;

  try {
    const allowed = await enforceConfirmationRateLimit(createAdminClient(), getClientIpFromHeaders(request.headers));
    return allowed ? null : "rate_limited";
  } catch {
    // Public confirmation is a sensitive lookup; an unavailable limiter must
    // fail closed instead of becoming a brute-force oracle.
    return "unavailable";
  }
}

const REFUSALS = {
  rate_limited: {
    status: 429,
    title: "Muitas consultas seguidas",
    message: "Aguarde alguns minutos e recarregue. Sua reserva não foi afetada.",
  },
  unavailable: {
    status: 503,
    title: "Não foi possível carregar sua reserva agora",
    message: "Foi uma falha temporária. Recarregue em instantes. Sua reserva não foi afetada.",
  },
} as const satisfies Record<ConfirmationRefusal, { status: number; title: string; message: string }>;

// The limiter counts in fixed windows aligned to the epoch.
function secondsUntilNextWindow(now: number): number {
  const { windowSeconds } = CONFIRMATION_RATE_LIMIT.perIp;
  return windowSeconds - (Math.floor(now / 1000) % windowSeconds);
}

// A complete page in the server HTML, readable without JavaScript. The reload
// button (shown only with JavaScript) keeps the #cancel fragment from the
// e-mail link, which a plain link to the same URL would drop.
export function confirmationRefusalResponse(
  refusal: ConfirmationRefusal,
  nonce: string,
  now = Date.now(),
): NextResponse {
  const { status, title, message } = REFUSALS[refusal];
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${title} — AgendFined</title>
    <style>
      :root { color-scheme: light dark; --bg: #ffffff; --fg: #111111; --muted: #5f5f5f; --border: #e5e5e5; }
      @media (prefers-color-scheme: dark) { :root { --bg: #141414; --fg: #eeeeee; --muted: #b0b0b0; --border: #333333; } }
      body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
      main { box-sizing: border-box; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 48px 16px; }
      section { box-sizing: border-box; width: 100%; max-width: 32rem; border: 1px solid var(--border); border-radius: 16px; padding: 32px; text-align: center; }
      h1 { margin: 0; font-size: 1.25rem; }
      p { margin: 12px 0 0; color: var(--muted); font-size: 0.875rem; line-height: 1.5; }
      button { margin-top: 24px; border: 0; border-radius: 8px; padding: 10px 16px; background: var(--fg); color: var(--bg); font: inherit; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <section role="alert">
        <h1>${title}</h1>
        <p>${message}</p>
        <button type="button" id="reload" hidden>Tentar novamente</button>
      </section>
    </main>
    <script nonce="${nonce}">
      var reload = document.getElementById("reload");
      reload.hidden = false;
      reload.addEventListener("click", function () { location.reload(); });
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(refusal === "rate_limited" ? secondsUntilNextWindow(now) : 30),
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

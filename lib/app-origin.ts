import "server-only";

const FALLBACK_ORIGIN = "http://localhost:3000";

// Origin used in links sent to the cliente (e-mails). Reads APP_URL, then
// NEXT_PUBLIC_APP_URL, and falls back to localhost when neither is set or the
// configured value is not a valid URL.
export function resolveAppOrigin(): URL {
  try {
    return new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || FALLBACK_ORIGIN);
  } catch {
    return new URL(FALLBACK_ORIGIN);
  }
}

// Origin for redirects back into the app (auth callback, checkout return).
// Reads APP_URL, then NEXT_PUBLIC_APP_URL, so the redirect never depends on
// the request's Host; without a valid configured value it keeps the request's
// own origin.
export function trustedAppOrigin(requestOrigin: string): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) return requestOrigin;
  try {
    return new URL(configured).origin;
  } catch {
    return requestOrigin;
  }
}

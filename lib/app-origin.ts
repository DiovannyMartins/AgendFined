import "server-only";

const FALLBACK_ORIGIN = "http://localhost:3000";

// APP_URL, then NEXT_PUBLIC_APP_URL; null when neither is a valid URL.
function configuredAppUrl(): URL | null {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) return null;
  try {
    return new URL(configured);
  } catch {
    return null;
  }
}

// Production fails closed: a link or redirect built from localhost or from the
// request's Host would send the cliente or the dono somewhere else.
function missingInProduction(): void {
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL_NOT_CONFIGURED");
}

// Origin used in links sent to the cliente (e-mails). Reads APP_URL, then
// NEXT_PUBLIC_APP_URL; outside production it falls back to localhost when
// neither is set or the configured value is not a valid URL.
export function resolveAppOrigin(): URL {
  const configured = configuredAppUrl();
  if (configured) return configured;
  missingInProduction();
  return new URL(FALLBACK_ORIGIN);
}

// Origin for redirects back into the app (auth callback, checkout return).
// Reads APP_URL, then NEXT_PUBLIC_APP_URL, so the redirect never depends on
// the request's Host; outside production, without a valid configured value,
// it keeps the request's own origin.
export function trustedAppOrigin(requestOrigin: string): string {
  const configured = configuredAppUrl();
  if (configured) return configured.origin;
  missingInProduction();
  return requestOrigin;
}

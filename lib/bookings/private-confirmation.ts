import { isValidCancelToken } from "./cancel-token";

// What happened to the confirmação por e-mail of a reserva just made: sent,
// failed (#187) or none, because the cliente left the e-mail blank (#195).
export type ConfirmationEmailStatus = "sent" | "failed" | "none";

const EMAIL_FRAGMENT: Record<Exclude<ConfirmationEmailStatus, "sent">, string> = {
  failed: "falhou",
  none: "sem",
};

// `confirmationEmail` is only for the navigation right after the reserva: it
// rides in the fragment with the capability, so it is scrubbed with it and
// never reaches the server, a reload or the e-mail link itself.
export function buildPrivateConfirmationPath(
  slug: string,
  publicCode: string,
  cancelToken: string,
  options: { confirmationEmail?: ConfirmationEmailStatus } = {},
): string {
  const query = new URLSearchParams({ code: publicCode });
  const fragment = new URLSearchParams({ cancel: cancelToken });
  if (options.confirmationEmail && options.confirmationEmail !== "sent") {
    fragment.set("email", EMAIL_FRAGMENT[options.confirmationEmail]);
  }
  return `/${encodeURIComponent(slug)}/confirmacao?${query.toString()}#${fragment.toString()}`;
}

export function readConfirmationEmailStatus(hash: string): ConfirmationEmailStatus {
  const value = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("email");
  if (value === EMAIL_FRAGMENT.failed) return "failed";
  if (value === EMAIL_FRAGMENT.none) return "none";
  return "sent";
}

export function buildPrivateConfirmationUrl(
  origin: URL,
  slug: string,
  publicCode: string,
  cancelToken: string,
): string {
  return new URL(buildPrivateConfirmationPath(slug, publicCode, cancelToken), origin).toString();
}

// Links already sent carry the slug the negócio had at booking time. Moving only
// the pathname keeps the code, the fragment capability and any legacy query.
export function moveConfirmationToSlug(href: string, slug: string): string {
  const url = new URL(href);
  url.pathname = `/${encodeURIComponent(slug)}/confirmacao`;
  return url.toString();
}

export function readCancelTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("cancel");
  return token && isValidCancelToken(token) ? token : null;
}

// The capability moved from the query (?cancel=, which reaches the server and
// its logs) to the fragment on 2026-10-14. A link sent before then belongs to a
// reserva at most 365 days ahead (the PROFISSIONAL window), so the query form
// stops being read after that last reserva could have started.
export const LEGACY_CANCEL_QUERY_UNTIL = Date.UTC(2027, 9, 15);

export function readPrivateCancelCapability(hash: string, search: string, now = Date.now()): string | null {
  const fragmentToken = readCancelTokenFromHash(hash);
  if (fragmentToken) return fragmentToken;
  if (now >= LEGACY_CANCEL_QUERY_UNTIL) return null;

  // Compatibility for links issued before capabilities moved to fragments.
  // Callers must immediately scrub this legacy query parameter from the URL.
  const legacyToken = new URLSearchParams(search).get("cancel");
  return legacyToken && isValidCancelToken(legacyToken) ? legacyToken : null;
}

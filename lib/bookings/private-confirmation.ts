import { isValidCancelToken } from "./cancel-token";

const EMAIL_FAILED = "falhou";

// `confirmationEmailFailed` is only for the navigation right after the reserva
// (#187): it rides in the fragment with the capability, so it is scrubbed with
// it and never reaches the server, a reload or the e-mail link itself.
export function buildPrivateConfirmationPath(
  slug: string,
  publicCode: string,
  cancelToken: string,
  options: { confirmationEmailFailed?: boolean } = {},
): string {
  const query = new URLSearchParams({ code: publicCode });
  const fragment = new URLSearchParams({ cancel: cancelToken });
  if (options.confirmationEmailFailed) fragment.set("email", EMAIL_FAILED);
  return `/${encodeURIComponent(slug)}/confirmacao?${query.toString()}#${fragment.toString()}`;
}

export function readConfirmationEmailFailed(hash: string): boolean {
  return new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("email") === EMAIL_FAILED;
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

export function readPrivateCancelCapability(hash: string, search: string): string | null {
  const fragmentToken = readCancelTokenFromHash(hash);
  if (fragmentToken) return fragmentToken;

  // Compatibility for links issued before capabilities moved to fragments.
  // Callers must immediately scrub this legacy query parameter from the URL.
  const legacyToken = new URLSearchParams(search).get("cancel");
  return legacyToken && isValidCancelToken(legacyToken) ? legacyToken : null;
}

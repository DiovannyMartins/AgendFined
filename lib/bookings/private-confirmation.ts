import { isValidCancelToken } from "./cancel-token";

export function buildPrivateConfirmationPath(
  slug: string,
  publicCode: string,
  cancelToken: string,
): string {
  const query = new URLSearchParams({ code: publicCode });
  const fragment = new URLSearchParams({ cancel: cancelToken });
  return `/${encodeURIComponent(slug)}/confirmacao?${query.toString()}#${fragment.toString()}`;
}

export function buildPrivateConfirmationUrl(
  configuredOrigin: string,
  slug: string,
  publicCode: string,
  cancelToken: string,
): string {
  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    origin = new URL("http://localhost:3000");
  }
  return new URL(buildPrivateConfirmationPath(slug, publicCode, cancelToken), origin).toString();
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

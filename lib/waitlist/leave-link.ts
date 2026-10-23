import { isValidCancelToken } from "@/lib/bookings/cancel-token";

// The private link that lets a cliente leave the lista de espera (#152). As with
// the reserva's private confirmation (ADR 0005), the capability rides in the
// fragment, so it is never sent in HTTP requests or written to server logs.
export function buildWaitlistLeavePath(slug: string, cancelToken: string): string {
  const fragment = new URLSearchParams({ token: cancelToken });
  return `/${encodeURIComponent(slug)}/lista-de-espera/sair#${fragment.toString()}`;
}

export function buildWaitlistLeaveUrl(origin: URL, slug: string, cancelToken: string): string {
  return new URL(buildWaitlistLeavePath(slug, cancelToken), origin).toString();
}

export function readWaitlistLeaveToken(hash: string): string | null {
  const token = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("token");
  return token && isValidCancelToken(token) ? token : null;
}

// Access gate seam (ADR 0013). With a single plan, a negócio either has access
// (teste grátis vigente or assinatura em dia, carência included) or is
// suspenso. The database decides it in `business_has_access()`, from now(), and
// `getCurrentBusiness` carries the answer as `has_access`. `assertAccess` is the
// server-side check every owner operation funnels through; it returns the
// agreed result shape so the caller can branch on it and surface an
// `ACCESS_REQUIRED` response without leaking internals. The database refuses
// the same operations on its own (RPCs and RLS), so this gate is the friendly
// message, not the only barrier.

// The janela of the Plano AgendFined. The database caps it the same way.
export const BOOKING_WINDOW_LIMIT_DAYS = 365;

export function getEffectiveBookingWindowDays(configuredDays: number): number {
  return Math.min(configuredDays, BOOKING_WINDOW_LIMIT_DAYS);
}

export type AccessGateResult = { ok: true } | { ok: false; code: "ACCESS_REQUIRED" };

export const ACCESS_REQUIRED_MESSAGE =
  "Seu negócio está suspenso. Assine o Plano AgendFined para voltar a usar este recurso.";

// Fail-closed: anything that isn't exactly `true` (false, null, undefined, a
// failed lookup) is treated as suspenso.
export function hasAccess(business: { has_access?: boolean | null }): boolean {
  return business.has_access === true;
}

export function assertAccess(business: { has_access?: boolean | null }): AccessGateResult {
  if (hasAccess(business)) return { ok: true };
  return { ok: false, code: "ACCESS_REQUIRED" };
}

const SENSITIVE_PATHS = [
  "/auth",
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/mfa",
];

export function isAnalyticsAllowedPath(pathname: string): boolean {
  if (SENSITIVE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return false;
  }
  // Both pages receive a private capability in the URL fragment (ADR 0005).
  return !/^\/[^/]+\/(confirmacao|lista-de-espera\/sair)\/?$/.test(pathname);
}

export function sanitizedPageLocation(origin: string, pathname: string): string {
  return new URL(pathname, origin).toString();
}

// Read on each call so tests can stub it; Next.js inlines it in client bundles.
export function googleAnalyticsMeasurementId(): string | null {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  return measurementId && /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId : null;
}

export function setAnalyticsDisabled(measurementId: string, disabled: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = disabled;
}

// A client-side navigation writes the new URL into history before any effect
// runs, so GoogleAnalytics only sees the new pathname after gtag.js may already
// have reported it (history page views read document.location, query and
// fragment included). Call this right before router.push to a page that must
// not be measured.
export function disableAnalyticsBeforeNavigation(href: string) {
  const measurementId = googleAnalyticsMeasurementId();
  if (!measurementId) return;
  if (!isAnalyticsAllowedPath(new URL(href, window.location.origin).pathname)) {
    setAnalyticsDisabled(measurementId, true);
  }
}

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

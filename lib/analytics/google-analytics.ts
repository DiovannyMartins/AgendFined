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
  return !/^\/[^/]+\/confirmacao\/?$/.test(pathname);
}

export function sanitizedPageLocation(origin: string, pathname: string): string {
  return new URL(pathname, origin).toString();
}

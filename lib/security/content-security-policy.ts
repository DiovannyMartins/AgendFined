export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://*.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' blob: data: https://*.google-analytics.com https://*.googletagmanager.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://challenges.cloudflare.com https://*.mux.com https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    "frame-src https://challenges.cloudflare.com",
    "media-src 'self' blob: https://*.mux.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

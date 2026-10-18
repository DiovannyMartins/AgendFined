// §9.1 reserved slugs. Static routes take precedence over app/[slug], so a
// business with one of these slugs would have an unreachable public page.
// reserved-slugs.test.ts fails when a first-level route in app/ or a prefix in
// public/ is missing here.
export const RESERVED_SLUGS: readonly string[] = [
  // app/ (route groups resolved: (auth) and (marketing) children are first-level)
  "api",
  "auth",
  "cadastro",
  "dashboard",
  "login",
  "mfa",
  "privacidade",
  "recuperar-senha",
  "redefinir-senha",
  "termos",
  // app/ metadata files (favicon.ico, icon.svg, manifest.ts, robots.ts…)
  "apple-icon",
  "favicon",
  "icon",
  "manifest",
  "robots",
  "sitemap",
  // public/
  "brand",
  "images",
  // Kept for planned or conventional routes.
  "admin",
  "precos",
  "pricing",
  "recursos",
  "suporte",
];

export const RESERVED_SLUG_MESSAGE = "Este endereço está reservado. Escolha outro slug.";

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.trim().toLowerCase());
}

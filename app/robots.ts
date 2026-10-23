import type { MetadataRoute } from "next";

const siteUrl = "https://agendfined.com.br";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/login",
        "/cadastro",
        "/recuperar-senha",
        "/redefinir-senha",
        "/mfa",
        "/*/consultar",
        "/*/confirmacao",
        "/*/lista-de-espera/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

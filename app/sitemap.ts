import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

const siteUrl = "https://agendfined.com.br";
export const revalidate = 3600;

const staticRoutes: MetadataRoute.Sitemap = [
  {
    url: siteUrl,
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    url: `${siteUrl}/privacidade`,
    changeFrequency: "monthly",
    priority: 0.3,
  },
  {
    url: `${siteUrl}/termos`,
    changeFrequency: "monthly",
    priority: 0.3,
  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("businesses")
      .select("slug, updated_at")
      .eq("is_active", true);

    if (error) return staticRoutes;

    const businessRoutes = (data ?? []).map((business) => ({
      url: `${siteUrl}/${encodeURIComponent(business.slug)}`,
      lastModified: business.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [...staticRoutes, ...businessRoutes];
  } catch {
    // The public site must still expose a valid sitemap when the admin
    // credentials are unavailable during a preview build.
    return staticRoutes;
  }
}

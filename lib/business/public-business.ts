import "server-only";

import { notFound, permanentRedirect } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// The active business behind a public slug. A slug the business used before
// (ADR 0007) redirects permanently to the same path under its current slug, so
// links shared before a slug change keep working; any other miss is a 404.
// The history lookup runs only on a miss, never on the common path, and a
// failure there stays a 404: the slug is already known not to be current.
export async function getPublicBusinessOrRedirect(supabase: ServerClient, slug: string, subpath = "") {
  const { data: businesses, error } = await supabase.rpc("get_public_business", { p_slug: slug });
  if (error) throw new Error("PUBLIC_BUSINESS_LOOKUP_FAILED");
  const business = businesses?.[0];
  if (business) return business;

  return redirectToCurrentSlugOrNotFound(supabase, slug, subpath);
}

// The miss path shared by every public page: a previous slug redirects, any
// other slug is a 404.
export async function redirectToCurrentSlugOrNotFound(
  supabase: ServerClient,
  slug: string,
  subpath = "",
): Promise<never> {
  const { data: moved, error: movedError } = await supabase.rpc("get_business_slug_redirect", { p_slug: slug });
  const currentSlug = movedError ? undefined : moved?.[0]?.slug;
  if (currentSlug && currentSlug !== slug) permanentRedirect(`/${currentSlug}${subpath}`);

  notFound();
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPublicBusinessOrRedirect } from "@/lib/business/public-business";
import { ConsultarForm } from "./consultar-form";

export const metadata: Metadata = { title: "Consultar reserva — AgendFined" };

export default async function ConsultarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const business = await getPublicBusinessOrRedirect(supabase, slug, "/consultar");

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
      <ConsultarForm slug={slug} timezone={business.timezone} />
    </main>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConsultarForm } from "./consultar-form";

export default async function ConsultarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: businesses, error } = await supabase.rpc("get_public_business", { p_slug: slug });
  if (error) throw new Error("PUBLIC_BUSINESS_LOOKUP_FAILED");
  const business = businesses?.[0];

  if (!business) notFound();

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
      <ConsultarForm slug={slug} />
    </div>
  );
}

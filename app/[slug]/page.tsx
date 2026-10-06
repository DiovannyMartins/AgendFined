import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BookingWidget } from "./booking-widget";
import { CalendarClock } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_public_business", { p_slug: slug });
    const business = data?.[0];
    if (!business) {
      return { title: "Página não encontrada — AgendFined", robots: { index: false, follow: false } };
    }

    const description = business.description ?? `Agende seu horário com ${business.name} online.`;
    return {
      title: `${business.name} — AgendFined`,
      description,
      alternates: { canonical: `/${encodeURIComponent(slug)}` },
      openGraph: {
        type: "website",
        title: `${business.name} — AgendFined`,
        description,
        url: `https://agendfined.com.br/${encodeURIComponent(slug)}`,
      },
    };
  } catch {
    return { title: "Agendamento online — AgendFined" };
  }
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: businesses, error: businessError } = await supabase.rpc("get_public_business", { p_slug: slug });
  if (businessError) throw new Error("PUBLIC_BUSINESS_LOOKUP_FAILED");
  const business = businesses?.[0];

  if (!business) notFound();

  const { data: services, error: servicesError } = await supabase.rpc("get_public_services", {
    p_business_id: business.id,
  });
  if (servicesError) throw new Error("PUBLIC_SERVICES_LOOKUP_FAILED");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-6">
        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarClock className="size-6" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{business.name}</h1>
          {business.description && (
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground">{business.description}</p>
          )}
        </header>

        <BookingWidget
          businessId={business.id}
          slug={slug}
          services={(services ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            durationMinutes: s.duration_minutes,
            priceCents: s.price_cents,
          }))}
        />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem uma reserva?{" "}
          <Link href={`/${slug}/consultar`} className="font-medium text-foreground hover:underline">
            Consultar reserva
          </Link>
        </p>
      </div>
    </div>
  );
}

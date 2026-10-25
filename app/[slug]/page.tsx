import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublicBusinessOrRedirect } from "@/lib/business/public-business";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveBookingWindowDays, isProPlan } from "@/lib/plan/plan";
import { hasActiveAvailability } from "@/lib/business/readiness";
import { BookingWidget } from "./booking-widget";
import { BookingUnavailable } from "./booking-unavailable";
import { CalendarClock } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_business", { p_slug: slug });
    // A failed lookup is not "not found" (#197): it gets the neutral title below.
    if (error) throw error;
    const business = data?.[0];
    if (!business) {
      return { title: "Página não encontrada — AgendFined", robots: { index: false, follow: false } };
    }

    const description = business.description ?? `Agende seu horário com ${business.name} online.`;
    return {
      title: `${business.name} — AgendFined`,
      description,
      // A business kept out of search (e.g. a test business in production)
      // stays bookable but out of the index; the sitemap leaves it out too.
      ...(business.search_indexing_enabled ? {} : { robots: { index: false, follow: false } }),
      alternates: { canonical: `/${encodeURIComponent(slug)}` },
      openGraph: {
        type: "website",
        title: `${business.name} — AgendFined`,
        description,
        url: `https://agendfined.com.br/${encodeURIComponent(slug)}`,
        images: [{ url: "/brand/social.png", width: 1200, height: 630, alt: "AgendFined" }],
      },
    };
  } catch {
    return { title: "Agendamento online — AgendFined" };
  }
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const business = await getPublicBusinessOrRedirect(supabase, slug);

  const { data: services, error: servicesError } = await supabase.rpc("get_public_services", {
    p_business_id: business.id,
  });
  if (servicesError) throw new Error("PUBLIC_SERVICES_LOOKUP_FAILED");

  // The plan stays server-side: the widget only learns whether the waitlist can
  // be offered. A failed lookup fails closed (no waitlist), like the plan gate.
  const admin = createAdminClient();
  const [{ data: planRow }, hasAvailability] = await Promise.all([
    admin.from("businesses").select("plan, booking_window_days, phone").eq("id", business.id).maybeSingle(),
    // Faixas are owner-only under RLS; only this boolean reaches the page.
    hasActiveAvailability(admin, business.id),
  ]);
  const offersWaitlist = isProPlan(planRow?.plan);
  // The janela only caps the date picker (open when the lookup failed); the
  // server still enforces the janela on every lookup and reserva.
  const bookingWindowDays = planRow
    ? getEffectiveBookingWindowDays(planRow.plan, planRow.booking_window_days)
    : undefined;
  const activeServices = services ?? [];

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/30">
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

        {activeServices.length === 0 ? (
          <BookingUnavailable reason="no_services" phone={planRow?.phone} />
        ) : !hasAvailability ? (
          <BookingUnavailable reason="no_availability" phone={planRow?.phone} />
        ) : (
          <BookingWidget
            businessId={business.id}
            slug={slug}
            timezone={business.timezone}
            bookingWindowDays={bookingWindowDays}
            offersWaitlist={offersWaitlist}
            services={activeServices.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              durationMinutes: s.duration_minutes,
              priceCents: s.price_cents,
            }))}
          />
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem uma reserva?{" "}
          <Link href={`/${slug}/consultar`} className="font-medium text-foreground hover:underline">
            Consultar reserva
          </Link>
        </p>
      </div>
    </main>
  );
}

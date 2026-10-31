import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirectToCurrentSlugOrNotFound } from "@/lib/business/public-business";
import { getPublicBookingPage } from "@/lib/business/public-booking-page";
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
    // A failed lookup is not "not found" (#197): it gets the neutral title below.
    const business = await getPublicBookingPage(slug);
    if (!business) {
      return { title: "Página não encontrada — AgendFined", robots: { index: false, follow: false } };
    }

    const description = business.description ?? `Agende seu horário com ${business.name} online.`;
    return {
      title: `${business.name} — AgendFined`,
      description,
      // A business kept out of search (e.g. a test business in production)
      // stays bookable but out of the index; the sitemap leaves it out too.
      ...(business.searchIndexingEnabled ? {} : { robots: { index: false, follow: false } }),
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
  // One cached RPC shared with generateMetadata (#216). The plan stays in the
  // database: only offersWaitlist and the effective janela reach the page. The
  // janela only caps the date picker; the server still enforces it on every
  // lookup and reserva.
  const business = (await getPublicBookingPage(slug))
    ?? await redirectToCurrentSlugOrNotFound(await createClient(), slug);
  const activeServices = business.services;
  const phone = business.phone ?? undefined;

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
          <BookingUnavailable reason="no_services" phone={phone} />
        ) : !business.hasAvailability ? (
          <BookingUnavailable reason="no_availability" phone={phone} />
        ) : (
          <BookingWidget
            businessId={business.id}
            slug={slug}
            timezone={business.timezone}
            bookingWindowDays={business.bookingWindowDays}
            offersWaitlist={business.offersWaitlist}
            services={activeServices}
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

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BookingWidget } from "./booking-widget";
import { CalendarClock } from "lucide-react";

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!business) notFound();

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

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

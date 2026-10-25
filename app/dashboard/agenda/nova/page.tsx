import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { toLocalDate } from "@/lib/booking/availability";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { NewBookingForm } from "./new-booking-form";

export const metadata: Metadata = { title: "Nova reserva — AgendFined" };

export default async function NovaReservaPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");
  const timezone = business.timezone || APP_TIMEZONE;

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price_cents")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/agenda"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Reservas
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Nova reserva</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Para o cliente que marcou por WhatsApp, telefone ou no balcão. A antecedência e a janela da página pública
          não valem aqui, e o e-mail do cliente é opcional.
        </p>
      </div>

      <div className="max-w-2xl rounded-xl border border-border bg-card/40 p-4">
        <NewBookingForm services={services ?? []} timezone={timezone} today={toLocalDate(new Date(), timezone)} />
      </div>
    </div>
  );
}

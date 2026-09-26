import { redirect } from "next/navigation";
import { BusinessForm } from "./business-form";
import { AvailabilityForm, AvailabilityRow } from "./availability-form";
import { PlanSection } from "./plan-section";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ConfiguracoesPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const supabase = await createClient();
  const { data: availability } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <BusinessForm
        initial={{
          name: business.name,
          slug: business.slug,
          phone: business.phone,
          slotIntervalMinutes: business.slot_interval_minutes,
          minNoticeMinutes: business.min_notice_minutes,
          bookingWindowDays: business.booking_window_days,
          description: business.description,
          plan: business.plan,
        }}
      />

      <PlanSection business={{ id: business.id, plan: business.plan }} />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Segurança da conta</h2>
        <p className="text-muted-foreground">Ative a autenticação em duas etapas com um aplicativo autenticador.</p>
        <Link href="/mfa" className="inline-block text-sm underline">Configurar autenticação em duas etapas</Link>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Disponibilidade recorrente</h2>
        <p className="mt-1 text-muted-foreground">
          Defina as faixas de atendimento por dia da semana, em hora local do negócio.
        </p>
        <div className="mt-4 rounded-xl border border-border p-4">
          <AvailabilityForm />
        </div>
        {availability && availability.length > 0 && (
          <div className="mt-4 space-y-2">
            {availability.map((row) => (
              <AvailabilityRow
                key={row.id}
                id={row.id}
                weekday={row.weekday}
                startTime={row.start_time}
                endTime={row.end_time}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

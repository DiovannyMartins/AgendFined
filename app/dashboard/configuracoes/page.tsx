import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BusinessForm } from "./business-form";
import { AvailabilityChangeNotice, AvailabilityChangeProvider, AvailabilityForm, AvailabilityRow } from "./availability-form";
import { PlanSection } from "./plan-section";
import { getCurrentBusiness } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { hasAccess } from "@/lib/plan/access";
import { SuspendedFieldset } from "@/components/suspended-fieldset";
import { getGoogleCalendarConnectionStatus } from "@/lib/google-calendar/queries";
import { GoogleCalendarSection } from "./google-calendar-section";

export const metadata: Metadata = { title: "Configurações — AgendFined" };

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const { calendar } = await searchParams;
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const supabase = await createClient();
  const googleCalendar = await getGoogleCalendarConnectionStatus(business.id, business.timezone);
  const { data: availability } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  // A suspended negócio (ADR 0013) sees its configurações but cannot change
  // them; the Plano section, the conta and the segurança stay usable.
  const suspended = !hasAccess(business);

  return (
    <div className="max-w-3xl space-y-10">
      <SuspendedFieldset suspended={suspended}>
        <BusinessForm
          initial={{
            name: business.name,
            slug: business.slug,
            phone: business.phone,
            slotIntervalMinutes: business.slot_interval_minutes,
            minNoticeMinutes: business.min_notice_minutes,
            bookingWindowDays: business.booking_window_days,
            timezone: business.timezone,
            description: business.description,
          }}
        />
      </SuspendedFieldset>

      {/* Para um negócio novo, a disponibilidade é o passo que libera as
          reservas, então vem logo depois dos dados do negócio (#149). */}
      <SuspendedFieldset suspended={suspended}>
      <section id="disponibilidade" className="scroll-mt-20">
        <h2 className="text-xl font-semibold">Disponibilidade recorrente</h2>
        <p className="mt-1 text-muted-foreground">
          Defina as faixas de atendimento por dia da semana, em hora local do negócio.
        </p>
        <AvailabilityChangeProvider>
          <div className="mt-4 rounded-xl border border-border p-4">
            <AvailabilityForm />
          </div>
          <AvailabilityChangeNotice />
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
        </AvailabilityChangeProvider>
      </section>
      </SuspendedFieldset>

      <PlanSection
        business={{
          id: business.id,
          plan: business.plan,
          timezone: business.timezone,
          currentSubscriptionId: business.current_subscription_id,
          hasAccess: !suspended,
          trialEndsAt: business.trial_ends_at,
        }}
      />

      <GoogleCalendarSection connection={googleCalendar} hasAccess={!suspended} callbackStatus={calendar} />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Segurança da conta</h2>
        <p className="text-muted-foreground">Ative a autenticação em duas etapas com um aplicativo autenticador.</p>
        <Link href="/mfa" className="inline-block text-sm underline">Configurar autenticação em duas etapas</Link>
      </section>
    </div>
  );
}

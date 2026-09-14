import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, CalendarClock, Download } from "lucide-react";
import { toLocalDate } from "@/lib/booking/availability";
import { filterAgenda } from "@/lib/agenda/view";
import { getGcalExport } from "@/lib/gcal/get-export";
import { isUpcomingConfirmed, type GcalExportBooking } from "@/lib/gcal/export";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { AgendaView } from "./agenda-view";

export default async function AgendaPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const supabase = await createClient();
  const [{ data: bookings }, { data: availability }] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("business_id", business.id)
      .order("start_at", { ascending: true }),
    supabase
      .from("availability")
      .select("weekday, start_time, end_time")
      .eq("business_id", business.id),
  ]);

  const list = bookings ?? [];
  const now = new Date();

  const todayKey = toLocalDate(now);
  const todayBookings = filterAgenda(list, {
    filters: { dateKey: todayKey },
  }).filter((b) => b.status !== "cancelled");

  const upcoming = list.filter((b) => isUpcomingConfirmed(b, now));

  // Owner calendar export (INC-3 / US25, Pro feature): the business's future
  // active reservations as an importable .ics feed, gated behind the
  // PROFISSIONAL plan. The page already loaded the owner's bookings, so we feed
  // them to the gate boundary instead of re-fetching.
  const exportResult = await getGcalExport({
    getBusiness: async () => business,
    fetchBookings: async () => list as unknown as GcalExportBooking[],
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reservas</h1>
          <p className="mt-1 text-muted-foreground">Acompanhe e gerencie seus atendimentos.</p>
        </div>
        {exportResult.status === "ok" && exportResult.count > 0 && (
          <a
            href={`data:text/calendar;charset=utf-8,${encodeURIComponent(exportResult.icsFeed)}`}
            download="agendfined-agenda.ics"
          >
            <Button size="sm" variant="outline">
              <Download className="size-4" />
              Exportar agenda (.ics)
            </Button>
          </a>
        )}
      </div>

      {exportResult.status === "upgrade_required" && (
        <UpgradePrompt
          title="Exportação de agenda é um recurso PROFISSIONAL"
          description="Assine o PROFISSIONAL para exportar sua agenda em .ics, que você pode importar no Google Calendar."
        />
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" /> Reservas de hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{todayBookings.length}</p>
            <p className="text-sm text-muted-foreground">
              {todayBookings.length === 0 ? "Nenhuma para hoje" : "atendimento(s) agendado(s)"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" /> Próximas reservas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{upcoming.length}</p>
            <p className="text-sm text-muted-foreground">confirmadas à frente</p>
          </CardContent>
        </Card>
      </div>

      <AgendaView
        bookings={list}
        availability={availability ?? []}
        slotIntervalMinutes={business.slot_interval_minutes}
      />
    </div>
  );
}

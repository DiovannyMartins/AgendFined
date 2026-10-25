import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { CalendarDays, CalendarClock, CalendarPlus, Download } from "lucide-react";
import { toLocalDate } from "@/lib/booking/availability";
import { filterAgenda, parseAgendaSearchParams } from "@/lib/agenda/view";
import { getGcalExport } from "@/lib/gcal/get-export";
import { isUpcomingConfirmed } from "@/lib/gcal/export";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { AgendaView } from "./agenda-view";

export const metadata: Metadata = { title: "Reservas — AgendFined" };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string | string[]; status?: string | string[] }>;
}) {
  const initialFilters = parseAgendaSearchParams(await searchParams);
  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");

  const supabase = await createClient();
  const { data: bookings } = await supabase
      .from("bookings")
      .select("id, start_at, end_at, status, service_name_snapshot, duration_minutes_snapshot, customer_name_snapshot, customer_phone_snapshot, public_code, cancel_reason, cancel_reason_category, cancelled_by, rescheduled_at, customer_note, customer_note_requires_follow_up")
      .eq("business_id", business.id)
      .order("start_at", { ascending: true });

  const list = bookings ?? [];
  const now = new Date();

  // Only what is still ahead today: a concluída, no-show or past reserva is
  // not an atendimento to prepare for (#149).
  const todayKey = toLocalDate(now, business.timezone);
  const todayBookings = filterAgenda(list, {
    tz: business.timezone,
    filters: { dateKey: todayKey },
  }).filter((b) => isUpcomingConfirmed(b, now));

  const upcoming = list.filter((b) => isUpcomingConfirmed(b, now));

  // Owner calendar export (INC-3 / US25, Pro feature): the business's future
  // active reservations as an importable .ics feed, gated behind the
  // PROFISSIONAL plan. The page already loaded the owner's bookings, so we feed
  // them to the gate boundary instead of re-fetching.
  const exportResult = await getGcalExport({
    getBusiness: async () => business,
    fetchBookings: async () => list,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reservas</h1>
          <p className="mt-2 text-sm text-muted-foreground">Acompanhe e gerencie seus atendimentos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {exportResult.status === "ok" && exportResult.count > 0 && (
            // A plain styled link: wrapping a <Button> in <a> nests a button in a
            // link and trips Base UI's native-button check.
            <a
              href={`data:text/calendar;charset=utf-8,${encodeURIComponent(exportResult.icsFeed)}`}
              download="agendfined-agenda.ics"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Download className="size-4" />
              Exportar agenda (.ics)
            </a>
          )}
          {/* Cliente que marcou por WhatsApp, telefone ou no balcão (#193). */}
          <Link href="/dashboard/agenda/nova" className={buttonVariants({ size: "sm" })}>
            <CalendarPlus className="size-4" />
            Nova reserva
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" /> Reservas de hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{todayBookings.length}</p>
            <p className="text-sm text-muted-foreground">
              {todayBookings.length === 0
                ? "Nenhum atendimento por vir hoje"
                : todayBookings.length === 1
                  ? "atendimento por vir hoje"
                  : "atendimentos por vir hoje"}
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
        timezone={business.timezone}
        initialDate={initialFilters.dateKey}
        initialStatus={initialFilters.status}
      />

      {/* After the list, and compact: on a phone the reservations must stay
          above the fold. */}
      {exportResult.status === "upgrade_required" && (
        <UpgradePrompt
          compact
          title="Exportação de agenda é um recurso PROFISSIONAL"
          description="Assine o PROFISSIONAL para exportar sua agenda em .ics, que você pode importar no Google Calendar."
        />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { CalendarDays, CalendarClock, CalendarPlus, Download } from "lucide-react";
import { localDayRangeUtc, toLocalDate } from "@/lib/booking/availability";
import { parseAgendaSearchParams } from "@/lib/agenda/view";
import { fetchAgendaWeek } from "@/lib/agenda/get-week";
import { hasAccess as businessHasAccess } from "@/lib/plan/access";
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

  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = toLocalDate(now, business.timezone);
  const day = initialFilters.dateKey ?? todayKey;
  // Only the week on screen comes from the database (#215): the whole history
  // was cut at PostgREST's 1000 rows, oldest first, hiding the future ones.
  const today = localDayRangeUtc(todayKey, business.timezone);

  const supabase = await createClient();
  const upcomingConfirmed = () =>
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "confirmed")
      .gte("start_at", nowIso);
  const [week, { count: todayCount }, { count: upcomingCount }, { count: anyCount }] =
    await Promise.all([
      fetchAgendaWeek(supabase, business.id, day, business.timezone),
      // Only what is still ahead today: a concluída, no-show or past reserva
      // is not an atendimento to prepare for (#149).
      upcomingConfirmed().lt("start_at", today.end),
      upcomingConfirmed(),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
    ]);

  const todayBookings = todayCount ?? 0;
  const upcoming = upcomingCount ?? 0;
  const hasAccess = businessHasAccess(business);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reservas</h1>
          <p className="mt-2 text-sm text-muted-foreground">Acompanhe e gerencie seus atendimentos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Owner calendar export (INC-3 / US25; needs access, ADR 0013):
              built on demand by the route, never embedded in this page (#215).
              A plain styled link: wrapping a <Button> in <a> nests a button in
              a link and trips Base UI's native-button check. A suspended
              negócio is told why by the painel banner. */}
          {hasAccess && upcoming > 0 && (
            <a
              href="/dashboard/agenda/exportar"
              download="agendfined-agenda.ics"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Download className="size-4" />
              Exportar agenda (.ics)
            </a>
          )}
          {/* Cliente que marcou por WhatsApp, telefone ou no balcão (#193). */}
          {hasAccess && (
            <Link href="/dashboard/agenda/nova" className={buttonVariants({ size: "sm" })}>
              <CalendarPlus className="size-4" />
              Nova reserva
            </Link>
          )}
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
            <p className="text-3xl font-semibold">{todayBookings}</p>
            <p className="text-sm text-muted-foreground">
              {todayBookings === 0
                ? "Nenhum atendimento por vir hoje"
                : todayBookings === 1
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
            <p className="text-3xl font-semibold">{upcoming}</p>
            <p className="text-sm text-muted-foreground">confirmadas à frente</p>
          </CardContent>
        </Card>
      </div>

      <AgendaView
        // A new week is a new fetch: remount so the day/status state restarts
        // from the URL the server just rendered.
        key={week.days[0]}
        bookings={week.bookings}
        timezone={business.timezone}
        businessName={business.name}
        automaticReminders={hasAccess}
        cancelOnly={!hasAccess}
        initialDate={day}
        initialStatus={initialFilters.status}
        hasAnyBooking={(anyCount ?? 0) > 0}
      />
    </div>
  );
}

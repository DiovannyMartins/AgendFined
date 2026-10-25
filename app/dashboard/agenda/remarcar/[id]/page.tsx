import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/queries";
import { toLocalDate } from "@/lib/booking/availability";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { formatPhoneBR } from "@/lib/format/phone";
import { formatWhenWithTimezone } from "@/lib/format/when";
import { formatPublicCode } from "@/lib/bookings/public-code";
import { RescheduleForm } from "./reschedule-form";

export const metadata: Metadata = { title: "Remarcar reserva — AgendFined" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Evaluated per request; reschedule_owner_booking enforces the same rule.
function isReschedulable(booking: { status: string; start_at: string }): boolean {
  return booking.status === "confirmed" && Date.parse(booking.start_at) > Date.now();
}

export default async function RemarcarReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const business = await getCurrentBusiness();
  if (!business) redirect("/dashboard/setup");
  const timezone = business.timezone || APP_TIMEZONE;

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, start_at, duration_minutes_snapshot, public_code, customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot, service_name_snapshot",
    )
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!booking) notFound();

  const reschedulable = isReschedulable(booking);

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
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Remarcar reserva</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A reserva continua a mesma: o código, o link do cliente e o histórico não mudam.{" "}
          {booking.customer_email_snapshot
            ? "O cliente recebe um e-mail com o novo horário."
            : "O cliente não tem e-mail: depois de remarcar, avise pelo WhatsApp."}
        </p>
      </div>

      <div className="max-w-2xl space-y-1 rounded-xl border border-border bg-card/40 p-4 text-sm">
        <p className="font-medium">
          {booking.service_name_snapshot} · {booking.duration_minutes_snapshot} min
        </p>
        <p>
          {booking.customer_name_snapshot} · {formatPhoneBR(booking.customer_phone_snapshot)}
        </p>
        <p className="text-muted-foreground">Horário atual: {formatWhenWithTimezone(booking.start_at, timezone)}</p>
        <p className="font-mono text-xs text-muted-foreground">Código: {formatPublicCode(booking.public_code)}</p>
      </div>

      <div className="max-w-2xl rounded-xl border border-border bg-card/40 p-4">
        {reschedulable ? (
          <RescheduleForm
            bookingId={booking.id}
            currentDate={toLocalDate(new Date(booking.start_at), timezone)}
            timezone={timezone}
            today={toLocalDate(new Date(), timezone)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Só é possível remarcar uma reserva confirmada que ainda não começou.
          </p>
        )}
      </div>
    </div>
  );
}

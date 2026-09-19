import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckCircle2, CalendarClock } from "lucide-react";
import { CopyCode } from "@/components/copy-code";
import { deriveCancelToken } from "@/lib/bookings/cancel";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { CancelBooking } from "./cancel-booking";
import { publicCodeSchema } from "@/lib/validation/schemas";
import { enforceConsultRateLimit, getClientIp } from "@/lib/booking/rate-limit";

async function ConfirmationContent({ code, slug }: { code: string; slug: string }) {
  const parsedCode = publicCodeSchema.safeParse(code);
  if (!parsedCode.success) notFound();

  const supabase = createAdminClient();
  try {
    const allowed = await enforceConsultRateLimit(supabase, await getClientIp());
    if (!allowed) notFound();
  } catch {
    // Public confirmation is a sensitive lookup; an unavailable limiter must
    // fail closed instead of becoming a brute-force oracle.
    notFound();
  }

  const { data, error } = await supabase.rpc("get_booking_by_public_code", { p_code: parsedCode.data });

  const booking = data?.[0];
  if (error || !booking || booking.business_slug !== slug) notFound();

  const dateStr = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: APP_TIMEZONE,
  }).format(new Date(booking.start_at));
  const timeStr = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  }).format(new Date(booking.start_at));

  const cancelToken = deriveCancelToken(process.env.CANCEL_TOKEN_SECRET ?? "", parsedCode.data);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700">
          <CheckCircle2 className="size-8" />
        </div>
        <h1 className="text-2xl font-semibold">Reserva confirmada!</h1>
        <p className="mt-2 text-muted-foreground">
          Você recebeu um horário garantido. Mostre esta confirmação na sua visita.
        </p>

        <div className="mt-6 space-y-3 rounded-xl bg-muted/40 p-5 text-left">
          <div className="flex items-center gap-2 font-medium">
            <CalendarClock className="size-5 text-primary" />
            {booking.service_name}
          </div>
          <p className="text-sm text-muted-foreground">
            {dateStr} · às {timeStr}
          </p>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">{booking.business_name}</p>
            <p className="text-sm text-muted-foreground">
              {booking.business_slug} · {booking.business_phone}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-1.5">
          <p className="text-xs text-muted-foreground">Guarde o código da sua reserva</p>
          <CopyCode code={parsedCode.data} />
        </div>
        <div className="mt-6 flex flex-col items-center gap-3 text-sm font-medium">
          {cancelToken && <CancelBooking code={parsedCode.data} token={cancelToken} />}
        </div>
        <div className="mt-6 flex flex-col gap-2 text-sm font-medium">
          <Link href={`/${slug}`} className="hover:underline">
            ← Fazer outra reserva
          </Link>
          <Link href={`/${slug}/consultar`} className="text-muted-foreground hover:underline">
            Consultar reserva por código
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { slug } = await params;
  const { code } = await searchParams;
  if (!code) notFound();

  return (
    <Suspense fallback={<div className="py-24 text-center text-muted-foreground">Carregando...</div>}>
      <ConfirmationContent code={code} slug={slug} />
    </Suspense>
  );
}

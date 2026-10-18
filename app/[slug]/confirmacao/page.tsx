import type { Metadata } from "next";
import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CalendarClock } from "lucide-react";
import { CopyCode } from "@/components/copy-code";
import { ConfirmationStatus } from "./confirmation-status";
import { publicCodeSchema } from "@/lib/validation/schemas";
import { enforceConsultRateLimit, getClientIp } from "@/lib/booking/rate-limit";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { publicDocumentTitle } from "@/lib/bookings/public-status";
import { formatPhoneBR } from "@/lib/format/phone";

// Shared by generateMetadata and the page within one request, so the lookup
// (and its rate-limit hit) runs once while the <title> follows the status.
const loadConfirmation = cache(async (code: string, slug: string) => {
  const parsedCode = publicCodeSchema.safeParse(code);
  if (!parsedCode.success) return null;

  const supabase = createAdminClient();
  try {
    const allowed = await enforceConsultRateLimit(supabase, await getClientIp());
    if (!allowed) return null;
  } catch {
    // Public confirmation is a sensitive lookup; an unavailable limiter must
    // fail closed instead of becoming a brute-force oracle.
    return null;
  }

  const { data, error } = await supabase.rpc("get_booking_by_public_code", { p_code: parsedCode.data });

  const booking = data?.[0];
  if (error || !booking || booking.business_slug !== slug) return null;
  return { code: parsedCode.data, booking };
});

async function ConfirmationContent({ code, slug }: { code: string; slug: string }) {
  const found = await loadConfirmation(code, slug);
  if (!found) notFound();
  const { booking } = found;

  const dateStr = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: booking.business_timezone ?? APP_TIMEZONE,
  }).format(new Date(booking.start_at));
  const timeStr = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: booking.business_timezone ?? APP_TIMEZONE,
  }).format(new Date(booking.start_at));

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <ConfirmationStatus code={found.code} initialStatus={booking.status}>
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
                {formatPhoneBR(booking.business_phone)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center gap-1.5">
            <p className="text-xs text-muted-foreground">Guarde o código da sua reserva</p>
            <CopyCode code={found.code} />
          </div>
        </ConfirmationStatus>
        <div className="mt-6 flex flex-col gap-2 text-sm font-medium">
          <Link href={`/${slug}`} className="hover:underline">
            ← Fazer outra reserva
          </Link>
          <Link href={`/${slug}/consultar`} className="text-muted-foreground hover:underline">
            Consultar reserva por código
          </Link>
        </div>
      </div>
    </main>
  );
}

type ConfirmationPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string }>;
};

export async function generateMetadata({ params, searchParams }: ConfirmationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { code } = await searchParams;
  const found = code ? await loadConfirmation(code, slug) : null;
  return { title: found ? publicDocumentTitle(found.booking.status) : "Reserva — AgendFined" };
}

export default async function ConfirmationPage({ params, searchParams }: ConfirmationPageProps) {
  const { slug } = await params;
  const { code } = await searchParams;
  if (!code) notFound();

  return (
    <Suspense fallback={<div className="py-24 text-center text-muted-foreground">Carregando...</div>}>
      <ConfirmationContent code={code} slug={slug} />
    </Suspense>
  );
}

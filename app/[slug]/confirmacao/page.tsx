import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CalendarClock } from "lucide-react";
import { ConfirmationStatus } from "./confirmation-status";
import { CurrentSlugRedirect } from "./current-slug-redirect";
import { publicCodeSchema } from "@/lib/validation/schemas";
import { APP_TIMEZONE } from "@/lib/app-timezone";
import { publicDocumentTitle, publicStatusView } from "@/lib/bookings/public-status";
import { BusinessPhone } from "@/components/business-contact";
import { TimezoneNotice } from "@/components/timezone-notice";
import { ConfirmationLookupError } from "./confirmation-errors";

// Shared by generateMetadata and the page within one request, so the lookup
// runs once while the <title> follows the status. The per-IP limiter already
// ran in the proxy, which answers a refusal with 429/503 before this page
// renders (lib/booking/confirmation-gate.ts, #179). Only an invalid or unknown
// code is "not_found"; a failed lookup says nothing about the booking and must
// not read as a 404 (#140).
const loadConfirmation = cache(async (code: string) => {
  const parsedCode = publicCodeSchema.safeParse(code);
  if (!parsedCode.success) return { kind: "not_found" } as const;

  const { data, error } = await createAdminClient().rpc("get_booking_by_public_code", { p_code: parsedCode.data });
  if (error) return { kind: "unavailable" } as const;

  const booking = data?.[0];
  if (!booking) return { kind: "not_found" } as const;
  // Evaluated per request; the cancel RPC enforces the same rule (#141).
  const started = Date.parse(booking.start_at) <= Date.now();
  return { kind: "found", code: parsedCode.data, booking, started } as const;
});

type FoundConfirmation = Extract<Awaited<ReturnType<typeof loadConfirmation>>, { kind: "found" }>;

function ConfirmationContent({ found, slug }: { found: FoundConfirmation; slug: string }) {
  const { booking } = found;
  // Links sent before a slug change still carry the old slug. The code never
  // authorizes access to customer data (ADR 0004), so following it to the
  // current slug exposes nothing the code did not already resolve.
  if (booking.business_slug !== slug) {
    return <CurrentSlugRedirect slug={booking.business_slug} code={found.code} />;
  }

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
        <ConfirmationStatus
          code={found.code}
          initialStatus={booking.status}
          started={found.started}
          reschedule={{ timezone: booking.business_timezone ?? APP_TIMEZONE, startAt: booking.start_at }}
        >
          <div className="mt-6 space-y-3 rounded-xl bg-muted/40 p-5 text-left">
            <div className="flex items-center gap-2 font-medium">
              <CalendarClock className="size-5 text-primary" />
              {booking.service_name}
            </div>
            <p className="text-sm text-muted-foreground">
              {dateStr} · às {timeStr}
            </p>
            <TimezoneNotice timezone={booking.business_timezone ?? APP_TIMEZONE} at={booking.start_at} />
            <div className="border-t border-border pt-3">
              <p className="text-sm font-medium">{booking.business_name}</p>
              <BusinessPhone phone={booking.business_phone} />
            </div>
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

export async function generateMetadata({ searchParams }: ConfirmationPageProps): Promise<Metadata> {
  const { code } = await searchParams;
  const found = code ? await loadConfirmation(code) : null;
  return {
    title:
      found?.kind === "found"
        ? publicDocumentTitle(publicStatusView(found.booking.status, found.started))
        : "Reserva — AgendFined",
  };
}

export default async function ConfirmationPage({ params, searchParams }: ConfirmationPageProps) {
  const { slug } = await params;
  const { code } = await searchParams;
  if (!code) notFound();

  // Resolve the code before rendering anything: a notFound() thrown inside a
  // Suspense boundary arrives after the 200 status is already streamed, which
  // turns an unknown code into a soft 404. The same applies to a failed
  // lookup below, which error.tsx renders with a 5xx status.
  const found = await loadConfirmation(code);
  if (found.kind === "not_found") notFound();
  if (found.kind !== "found") throw new ConfirmationLookupError();

  return <ConfirmationContent found={found} slug={slug} />;
}

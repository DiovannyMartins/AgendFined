import type { Ref } from "react";
import { CalendarCheck, CalendarX, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import { PUBLIC_STATUS_COPY, type PublicStatusTone, type PublicStatusView } from "@/lib/bookings/public-status";

const TONE: Record<PublicStatusTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  danger: { icon: XCircle, className: "bg-destructive/10 text-destructive" },
  neutral: { icon: CalendarCheck, className: "bg-muted text-foreground" },
  warning: { icon: CalendarX, className: "bg-amber-100 text-amber-700" },
};

// Status header shared by the public confirmation and consultation screens:
// icon, title and explanation follow the reserva's current status.
export function PublicBookingStatus({
  status,
  headingRef,
}: {
  status: PublicStatusView;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const copy = PUBLIC_STATUS_COPY[status];
  const tone = TONE[copy.tone];
  const Icon = tone.icon;

  return (
    <div>
      <div className={`mx-auto mb-4 flex size-14 items-center justify-center rounded-full ${tone.className}`}>
        <Icon className="size-8" aria-hidden="true" />
      </div>
      <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-2xl font-semibold outline-none">
        {copy.title}
      </h1>
      <p className="mt-2 text-muted-foreground">{copy.description}</p>
    </div>
  );
}

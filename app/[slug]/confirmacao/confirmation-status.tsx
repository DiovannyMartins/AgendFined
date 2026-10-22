"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PublicBookingStatus } from "@/components/public-booking-status";
import { CopyCode } from "@/components/copy-code";
import { publicCodeHint, publicDocumentTitle, publicStatusView } from "@/lib/bookings/public-status";
import type { BookingStatus } from "@/lib/bookings/transitions";
import { PrivateCancellation } from "./private-cancellation";

// Owns the status shown on the confirmation screen so a self-service
// cancellation immediately replaces "Reserva confirmada!" (and the tab title)
// instead of leaving both messages on screen.
export function ConfirmationStatus({
  code,
  initialStatus,
  started = false,
  children,
}: {
  code: string;
  initialStatus: BookingStatus;
  started?: boolean;
  children: ReactNode;
}) {
  const [status, setStatus] = useState(initialStatus);
  const view = publicStatusView(status, started);

  useEffect(() => {
    if (status !== initialStatus) document.title = publicDocumentTitle(view);
  }, [status, initialStatus, view]);

  return (
    <>
      <div aria-live="polite">
        <PublicBookingStatus status={view} />
      </div>
      {children}
      <div className="mt-4 flex flex-col items-center gap-1.5">
        <p className="text-xs text-muted-foreground">{publicCodeHint(view)}</p>
        <CopyCode code={code} />
      </div>
      <div className="mt-6 flex flex-col items-center gap-3 text-sm font-medium">
        <PrivateCancellation
          code={code}
          canCancel={view === "confirmed"}
          onCancelled={() => setStatus("cancelled")}
        />
      </div>
    </>
  );
}

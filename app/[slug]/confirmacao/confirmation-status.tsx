"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PublicBookingStatus } from "@/components/public-booking-status";
import { publicDocumentTitle } from "@/lib/bookings/public-status";
import type { BookingStatus } from "@/lib/bookings/transitions";
import { PrivateCancellation } from "./private-cancellation";

// Owns the status shown on the confirmation screen so a self-service
// cancellation immediately replaces "Reserva confirmada!" (and the tab title)
// instead of leaving both messages on screen.
export function ConfirmationStatus({
  code,
  initialStatus,
  children,
}: {
  code: string;
  initialStatus: BookingStatus;
  children: ReactNode;
}) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (status !== initialStatus) document.title = publicDocumentTitle(status);
  }, [status, initialStatus]);

  return (
    <>
      <div aria-live="polite">
        <PublicBookingStatus status={status} />
      </div>
      {children}
      <div className="mt-6 flex flex-col items-center gap-3 text-sm font-medium">
        <PrivateCancellation
          code={code}
          canCancel={status === "confirmed"}
          onCancelled={() => setStatus("cancelled")}
        />
      </div>
    </>
  );
}

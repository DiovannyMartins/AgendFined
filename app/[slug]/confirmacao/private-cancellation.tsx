"use client";

import { useEffect, useState } from "react";
import {
  buildPrivateConfirmationUrl,
  readConfirmationEmailStatus,
  readPrivateCancelCapability,
  type ConfirmationEmailStatus,
} from "@/lib/bookings/private-confirmation";
import { CancelBooking } from "./cancel-booking";
import { RescheduleBooking } from "./reschedule-booking";

// The capability is always captured and scrubbed from the URL, but the cancel
// and remarcação (#194) controls are only offered while the reserva is still
// confirmed and has not started.
export function PrivateCancellation({
  code,
  canCancel,
  onCancelled,
  reschedule,
}: {
  code: string;
  canCancel: boolean;
  onCancelled: () => void;
  // Where the reserva is now, for the remarcação dialog.
  reschedule?: { timezone: string; startAt: string };
}) {
  const [token, setToken] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<ConfirmationEmailStatus>("sent");
  const [privateUrl, setPrivateUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const captureCapability = () => {
      if (!active) return;
      const cancelToken = readPrivateCancelCapability(
        window.location.hash,
        window.location.search,
      );
      if (cancelToken) {
        setToken(cancelToken);
        setConfirmationEmail(readConfirmationEmailStatus(window.location.hash));
        // Rebuilt without the e-mail flag, so the link the cliente keeps is the
        // same one the e-mail would have carried (#195).
        const slug = decodeURIComponent(window.location.pathname.split("/")[1] ?? "");
        setPrivateUrl(buildPrivateConfirmationUrl(new URL(window.location.origin), slug, code, cancelToken));
      }

      // The fragment is not sent in HTTP requests. Remove it from the visible URL
      // as soon as the client captures the capability so copies and screenshots do
      // not expose it either.
      const cleanUrl = new URL(window.location.href);
      const hadLegacyToken = cleanUrl.searchParams.has("cancel");
      cleanUrl.searchParams.delete("cancel");
      cleanUrl.hash = "";
      if (window.location.hash || hadLegacyToken) {
        window.history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}`);
      }
    };
    queueMicrotask(captureCapability);
    window.addEventListener("hashchange", captureCapability);
    return () => {
      active = false;
      window.removeEventListener("hashchange", captureCapability);
    };
  }, [code]);

  return token && canCancel ? (
    <>
      {reschedule && (
        <RescheduleBooking
          code={code}
          token={token}
          timezone={reschedule.timezone}
          currentStartAt={reschedule.startAt}
        />
      )}
      <CancelBooking
        code={code}
        token={token}
        confirmationEmail={confirmationEmail}
        privateUrl={privateUrl ?? undefined}
        onCancelled={onCancelled}
      />
    </>
  ) : null;
}

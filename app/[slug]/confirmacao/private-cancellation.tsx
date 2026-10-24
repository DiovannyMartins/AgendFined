"use client";

import { useEffect, useState } from "react";
import {
  readConfirmationEmailFailed,
  readPrivateCancelCapability,
} from "@/lib/bookings/private-confirmation";
import { CancelBooking } from "./cancel-booking";

// The capability is always captured and scrubbed from the URL, but the cancel
// control is only offered while the reserva is still confirmed.
export function PrivateCancellation({
  code,
  canCancel,
  onCancelled,
}: {
  code: string;
  canCancel: boolean;
  onCancelled: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [emailFailed, setEmailFailed] = useState(false);

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
        setEmailFailed(readConfirmationEmailFailed(window.location.hash));
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
  }, []);

  return token && canCancel ? (
    <CancelBooking
      code={code}
      token={token}
      confirmationEmailSent={!emailFailed}
      onCancelled={onCancelled}
    />
  ) : null;
}

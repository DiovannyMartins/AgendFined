"use client";

import { useEffect, useState } from "react";
import { readPrivateCancelCapability } from "@/lib/bookings/private-confirmation";
import { CancelBooking } from "./cancel-booking";

export function PrivateCancellation({ code }: { code: string }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const captureCapability = () => {
      if (!active) return;
      const cancelToken = readPrivateCancelCapability(
        window.location.hash,
        window.location.search,
      );
      if (cancelToken) setToken(cancelToken);

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

  return token ? <CancelBooking code={code} token={token} /> : null;
}

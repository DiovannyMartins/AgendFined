"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  googleAnalyticsMeasurementId,
  isAnalyticsAllowedPath,
  sanitizedPageLocation,
  setAnalyticsDisabled,
} from "@/lib/analytics/google-analytics";

declare global {
  interface Window {
    dataLayer: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

const validMeasurementId = googleAnalyticsMeasurementId();

export function GoogleAnalytics({ nonce }: { nonce?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!validMeasurementId) return;

    const allowed = isAnalyticsAllowedPath(pathname);
    setAnalyticsDisabled(validMeasurementId, !allowed);
    if (!allowed) return;

    window.dataLayer ||= [];
    window.gtag ??= (...args: unknown[]) => window.dataLayer.push(args);

    if (!document.querySelector(`script[data-ga-id="${validMeasurementId}"]`)) {
      window.gtag("js", new Date());
      window.gtag("config", validMeasurementId, {
        anonymize_ip: true,
        send_page_view: false,
      });

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${validMeasurementId}`;
      script.dataset.gaId = validMeasurementId;
      if (nonce) script.nonce = nonce;
      document.head.appendChild(script);
    }

    window.gtag("event", "page_view", {
      page_location: sanitizedPageLocation(window.location.origin, pathname),
      page_path: pathname,
      page_title: document.title,
    });
  }, [nonce, pathname]);

  return null;
}

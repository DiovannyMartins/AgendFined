"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAnalyticsAllowedPath, sanitizedPageLocation } from "@/lib/analytics/google-analytics";

declare global {
  interface Window {
    dataLayer: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const validMeasurementId = measurementId && /^G-[A-Z0-9]+$/i.test(measurementId)
  ? measurementId
  : null;

export function GoogleAnalytics({ nonce }: { nonce?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!validMeasurementId) return;

    const analyticsWindow = window as unknown as Record<string, unknown>;
    const allowed = isAnalyticsAllowedPath(pathname);
    analyticsWindow[`ga-disable-${validMeasurementId}`] = !allowed;
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

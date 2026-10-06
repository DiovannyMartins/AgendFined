type AnalyticsValue = string | number | boolean;

type GoogleTag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer: unknown[][];
    gtag?: GoogleTag;
  }
}

export function trackAnalyticsEvent(
  name: string,
  params?: Record<string, AnalyticsValue>,
) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", name, params ?? {});
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(["event", name, params ?? {}]);
}

export {};

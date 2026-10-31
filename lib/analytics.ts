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

// For an event sent right before leaving for a page GA must not measure:
// `leave` runs once gtag.js reports the hit dispatched or, if the tag never
// loaded or answers, after `timeoutMs`, so a blocked script cannot hold it.
export function trackAnalyticsEventBeforeLeaving(
  name: string,
  params: Record<string, AnalyticsValue>,
  leave: () => void,
  timeoutMs = 1000,
) {
  let left = false;
  const leaveOnce = () => {
    if (left) return;
    left = true;
    clearTimeout(timer);
    leave();
  };
  const timer = setTimeout(leaveOnce, timeoutMs);
  if (typeof window.gtag !== "function") {
    trackAnalyticsEvent(name, params);
    leaveOnce();
    return;
  }
  window.gtag("event", name, { ...params, event_callback: leaveOnce, event_timeout: timeoutMs });
}

export {};

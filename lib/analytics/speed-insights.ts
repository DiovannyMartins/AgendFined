import { isAnalyticsAllowedPath } from "./google-analytics";

type SpeedInsightsEvent = { type: "vital"; url: string; route?: string };

// Speed Insights sends the page URL with each vital. Apply the same rule as
// Google Analytics: never the query or fragment (booking codes, ADR 0005
// capabilities), and nothing from the sensitive pages.
export function speedInsightsBeforeSend(event: SpeedInsightsEvent): SpeedInsightsEvent | null {
  const url = new URL(event.url);
  if (!isAnalyticsAllowedPath(url.pathname)) return null;
  return { ...event, url: `${url.origin}${url.pathname}` };
}

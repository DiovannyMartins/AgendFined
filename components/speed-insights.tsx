"use client";

import { SpeedInsights as VercelSpeedInsights } from "@vercel/speed-insights/next";
import { speedInsightsBeforeSend } from "@/lib/analytics/speed-insights";

// A client wrapper because beforeSend is a function and cannot cross the
// server layout boundary. The script is injected from this bundle, so the CSP
// nonce trust reaches it through 'strict-dynamic'.
export function SpeedInsights() {
  return <VercelSpeedInsights beforeSend={speedInsightsBeforeSend} />;
}

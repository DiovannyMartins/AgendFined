"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";

export function LoginAnalyticsTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("login") !== "1") return;

    trackAnalyticsEvent("login", { method: "password" });
    url.searchParams.delete("login");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return null;
}

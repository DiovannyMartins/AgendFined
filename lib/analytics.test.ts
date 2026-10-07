import { afterEach, describe, expect, it, vi } from "vitest";
import { trackAnalyticsEvent } from "@/lib/analytics";

describe("trackAnalyticsEvent", () => {
  afterEach(() => {
    delete window.gtag;
    window.dataLayer = [];
  });

  it("sends through gtag when the tag is loaded", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    trackAnalyticsEvent("booking_complete", { plan: "free" });
    expect(gtag).toHaveBeenCalledWith("event", "booking_complete", { plan: "free" });
    expect(window.dataLayer ?? []).toHaveLength(0);
  });

  it("queues on dataLayer when gtag is missing (script still loading or blocked)", () => {
    delete window.gtag;
    // @ts-expect-error simulate a page where the snippet never ran
    window.dataLayer = undefined;
    expect(() => trackAnalyticsEvent("sign_up")).not.toThrow();
    expect(window.dataLayer).toEqual([["event", "sign_up", {}]]);
  });

  it("only forwards the parameters it was given", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    trackAnalyticsEvent("login");
    expect(gtag).toHaveBeenCalledWith("event", "login", {});
  });
});

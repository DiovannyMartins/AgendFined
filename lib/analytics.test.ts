import { afterEach, describe, expect, it, vi } from "vitest";
import { trackAnalyticsEvent, trackAnalyticsEventBeforeLeaving } from "@/lib/analytics";

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

describe("trackAnalyticsEventBeforeLeaving", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete window.gtag;
    window.dataLayer = [];
  });

  it("leaves once gtag.js reports the event dispatched", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const leave = vi.fn();
    trackAnalyticsEventBeforeLeaving("booking_complete", { method: "public_form" }, leave);

    expect(leave).not.toHaveBeenCalled();
    const [, , params] = gtag.mock.calls[0];
    expect(params).toMatchObject({ method: "public_form", event_timeout: 1000 });
    params.event_callback();
    params.event_callback();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("leaves after the timeout when gtag.js never answers (blocked script)", () => {
    vi.useFakeTimers();
    window.gtag = vi.fn();
    const leave = vi.fn();
    trackAnalyticsEventBeforeLeaving("booking_complete", {}, leave, 500);

    vi.advanceTimersByTime(499);
    expect(leave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("leaves at once when GA is not on the page", () => {
    vi.useFakeTimers();
    const leave = vi.fn();
    trackAnalyticsEventBeforeLeaving("booking_complete", {}, leave);
    expect(leave).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(leave).toHaveBeenCalledTimes(1);
  });
});

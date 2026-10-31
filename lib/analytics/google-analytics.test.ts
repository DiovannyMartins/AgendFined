import { afterEach, describe, expect, it, vi } from "vitest";
import {
  disableAnalyticsBeforeNavigation,
  googleAnalyticsMeasurementId,
  isAnalyticsAllowedPath,
  sanitizedPageLocation,
} from "./google-analytics";

describe("Google Analytics privacy boundary", () => {
  it("does not run on confirmation or authentication routes", () => {
    expect(isAnalyticsAllowedPath("/barbearia/confirmacao")).toBe(false);
    expect(isAnalyticsAllowedPath("/barbearia/lista-de-espera/sair")).toBe(false);
    expect(isAnalyticsAllowedPath("/mfa")).toBe(false);
    expect(isAnalyticsAllowedPath("/redefinir-senha")).toBe(false);
    expect(isAnalyticsAllowedPath("/auth/callback")).toBe(false);
  });

  it("allows ordinary public and dashboard routes", () => {
    expect(isAnalyticsAllowedPath("/barbearia")).toBe(true);
    expect(isAnalyticsAllowedPath("/dashboard")).toBe(true);
  });

  it("builds page locations without query strings or fragments", () => {
    expect(sanitizedPageLocation("https://agenda.example", "/barbearia")).toBe(
      "https://agenda.example/barbearia",
    );
  });

  it("only accepts a GA4 measurement ID", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-ABC123");
    expect(googleAnalyticsMeasurementId()).toBe("G-ABC123");
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "UA-1');alert(1)//");
    expect(googleAnalyticsMeasurementId()).toBeNull();
    vi.unstubAllEnvs();
  });
});

// GHSA-3h6j: Next.js writes the new URL into history before the root layout's
// effect sees the pathname, so GA must be off before router.push starts.
describe("disableAnalyticsBeforeNavigation", () => {
  const flag = "ga-disable-G-TEST000000";
  const analyticsWindow = window as unknown as Record<string, unknown>;

  afterEach(() => {
    vi.unstubAllEnvs();
    delete analyticsWindow[flag];
  });

  it("turns GA off before navigating to a capability URL", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST000000");
    analyticsWindow[flag] = false;
    disableAnalyticsBeforeNavigation("/barbearia/confirmacao?code=65925DBB#cancel=token");
    expect(analyticsWindow[flag]).toBe(true);
  });

  it("leaves GA alone on an ordinary navigation", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST000000");
    analyticsWindow[flag] = false;
    disableAnalyticsBeforeNavigation("/dashboard/agenda?data=2026-10-31");
    expect(analyticsWindow[flag]).toBe(false);
  });

  it("does nothing without a measurement ID", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    disableAnalyticsBeforeNavigation("/barbearia/confirmacao?code=65925DBB");
    expect(flag in analyticsWindow).toBe(false);
  });
});

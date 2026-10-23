import { describe, expect, it } from "vitest";
import { isAnalyticsAllowedPath, sanitizedPageLocation } from "./google-analytics";

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
});

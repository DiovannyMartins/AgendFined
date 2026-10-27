import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAppOrigin, trustedAppOrigin } from "@/lib/app-origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAppOrigin", () => {
  it("prefers APP_URL", () => {
    vi.stubEnv("APP_URL", "https://agenda.example/base");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public.example");

    expect(resolveAppOrigin().toString()).toBe("https://agenda.example/base");
  });

  it("falls back to NEXT_PUBLIC_APP_URL when APP_URL is not set", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public.example");

    expect(resolveAppOrigin().toString()).toBe("https://public.example/");
  });

  it("falls back to localhost when neither is set", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(resolveAppOrigin().toString()).toBe("http://localhost:3000/");
  });

  it("falls back to localhost when the configured value is not a URL", () => {
    vi.stubEnv("APP_URL", "not a url");

    expect(resolveAppOrigin().toString()).toBe("http://localhost:3000/");
  });
});

describe("trustedAppOrigin", () => {
  it("uses the configured origin instead of the request's", () => {
    vi.stubEnv("APP_URL", "https://agenda.example/base");

    expect(trustedAppOrigin("https://evil.example")).toBe("https://agenda.example");
  });

  it("keeps the request's origin outside production when nothing is configured", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(trustedAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

// Em produção, sem APP_URL válido, links e redirecionamentos iriam para
// localhost ou para o Host da requisição.
describe("app origin in production", () => {
  it.each([["", ""], ["not a url", ""]])("fails closed when APP_URL is %j", (appUrl, publicUrl) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", appUrl);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", publicUrl);

    expect(() => resolveAppOrigin()).toThrow("APP_URL_NOT_CONFIGURED");
    expect(() => trustedAppOrigin("https://evil.example")).toThrow("APP_URL_NOT_CONFIGURED");
  });

  it("uses the configured origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://agenda.example");

    expect(resolveAppOrigin().toString()).toBe("https://agenda.example/");
    expect(trustedAppOrigin("https://evil.example")).toBe("https://agenda.example");
  });
});

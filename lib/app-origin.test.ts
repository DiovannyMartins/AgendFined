import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAppOrigin } from "@/lib/app-origin";

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

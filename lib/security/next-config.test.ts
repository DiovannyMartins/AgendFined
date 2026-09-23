import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js security response configuration", () => {
  it("disables framework disclosure", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applies the defensive headers to every path", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toHaveLength(1);
    expect(rules?.[0].source).toBe("/:path*");

    const headers = new Map(rules?.[0].headers.map(({ key, value }) => [key, value]));
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy")).toContain("https://challenges.cloudflare.com");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });
});

import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./content-security-policy";

describe("Content Security Policy", () => {
  it("authorizes scripts with a request nonce and never unsafe-inline", () => {
    const csp = buildContentSecurityPolicy("nonce-value", false);
    const scriptDirective = csp.split("; ").find((directive) => directive.startsWith("script-src"));

    expect(scriptDirective).toContain("'nonce-nonce-value'");
    expect(scriptDirective).toContain("'strict-dynamic'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows eval only for the development runtime", () => {
    expect(buildContentSecurityPolicy("nonce", true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy("nonce", false)).not.toContain("'unsafe-eval'");
  });

  // #219: no Supabase client runs in the browser; every query goes through the server.
  it("does not let the browser connect to Supabase", () => {
    const connectDirective = buildContentSecurityPolicy("nonce", false)
      .split("; ")
      .find((directive) => directive.startsWith("connect-src"));

    expect(connectDirective).toBeDefined();
    expect(connectDirective).not.toContain("supabase");
  });
});

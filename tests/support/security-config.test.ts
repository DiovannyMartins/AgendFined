import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authConfig = readFileSync("supabase/config.toml", "utf8");
const bookingInvariantMigration = readFileSync(
  "supabase/migrations/20261013010000_security_booking_invariant.sql",
  "utf8",
);

describe("security configuration contracts", () => {
  it("requires mixed-character passwords at the Auth boundary", () => {
    expect(authConfig).toContain('password_requirements = "lower_upper_letters_digits_symbols"');
  });

  it("keeps Turnstile CAPTCHA on for the production Auth endpoints", () => {
    const production = authConfig.slice(authConfig.indexOf("[remotes.production]"));
    expect(production).toContain('project_id = "wgmmrpvrtgsxwdhtgfjy"');
    expect(production).toMatch(
      /\[remotes\.production\.auth\.captcha\]\s+enabled = true\s+provider = "turnstile"\s+secret = "env\(SUPABASE_AUTH_CAPTCHA_SECRET\)"/,
    );
  });

  it("keeps booking creation bound to the private cancellation capability", () => {
    expect(bookingInvariantMigration).toContain(
      "drop function if exists public.create_booking(uuid, uuid, timestamptz, text, text, text, text);",
    );
    expect(bookingInvariantMigration).toContain("p_cancel_token_hash text");
    expect(bookingInvariantMigration).toContain("BOOKING_OUTSIDE_PLAN_WINDOW");
    expect(bookingInvariantMigration).toContain("INVALID_CANCEL_TOKEN_HASH");
  });
});

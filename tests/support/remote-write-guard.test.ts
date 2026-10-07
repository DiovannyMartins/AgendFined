import { describe, expect, it } from "vitest";
import { dateInTimeZone, decideRemoteWrites } from "./remote-write-guard";

const base = {
  ALLOW_REMOTE_E2E_WRITES: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  E2E_ALLOWED_SUPABASE_HOSTS: "test-project.supabase.co",
};

describe("decideRemoteWrites", () => {
  it("allows only with the explicit flag and an allow-listed host", () => {
    expect(decideRemoteWrites(base)).toEqual({ allowed: true, host: "test-project.supabase.co" });
  });

  const cases: Array<[Record<string, string | undefined>, string]> = [
    [{ ALLOW_REMOTE_E2E_WRITES: undefined }, "missing flag"],
    [{ ALLOW_REMOTE_E2E_WRITES: "1" }, "non-literal flag"],
    [{ SUPABASE_SERVICE_ROLE_KEY: undefined }, "missing key"],
    [{ NEXT_PUBLIC_SUPABASE_URL: "not a url" }, "invalid url"],
    [{ E2E_ALLOWED_SUPABASE_HOSTS: undefined }, "empty allow-list"],
    [{ E2E_ALLOWED_SUPABASE_HOSTS: "other.supabase.co" }, "host not allow-listed"],
    [{ E2E_FORBIDDEN_SUPABASE_HOSTS: "test-project.supabase.co" }, "forbidden host wins"],
  ];
  it.each(cases)("refuses %o (%s)", (override) => {
    expect(decideRemoteWrites({ ...base, ...override }).allowed).toBe(false);
  });
});

describe("dateInTimeZone", () => {
  it("uses the target zone, not the machine zone", () => {
    // 02:30 UTC on 7 Oct is still 6 Oct in São Paulo (UTC-3).
    const now = new Date("2026-10-07T02:30:00Z");
    expect(dateInTimeZone("America/Sao_Paulo", 0, now)).toBe("2026-10-06");
    expect(dateInTimeZone("America/Sao_Paulo", 1, now)).toBe("2026-10-07");
  });
});

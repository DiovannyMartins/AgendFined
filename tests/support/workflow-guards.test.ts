import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static guard: keeps the restore drill from silently losing assertions.
const drill = readFileSync(".github/workflows/backup-restore-drill.yml", "utf8");

describe("backup restore drill workflow", () => {
  it("fails on errors, unset variables and broken pipelines", () => {
    expect(drill).toContain("shell: bash -euo pipefail {0}");
  });

  it("requires restored rows in every checked table, including auth.users", () => {
    for (const name of ["businesses", "bookings", "customers", "users"]) {
      expect(drill).toContain(`test "\${${name}:-0}" -gt 0`);
    }
    expect(drill).toContain("(select count(*) from auth.users)");
  });

  it("keeps the RLS and foreign key checks", () => {
    expect(drill).toContain('test "$rls_missing" = "0"');
    expect(drill).toContain('test "$fk_count" -gt 0');
  });

  it("only trusts the backup workflow on the default branch and always stops the database", () => {
    expect(drill).toContain("--workflow database-backup.yml");
    expect(drill).toContain("--status success");
    expect(drill).toContain("--branch \"${{ github.event.repository.default_branch }}\"");
    expect(drill).toMatch(/Stop isolated database\r?\n\s+if: always\(\)/);
  });
});

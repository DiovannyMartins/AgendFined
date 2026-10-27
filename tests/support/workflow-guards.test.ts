import { readdirSync, readFileSync } from "node:fs";
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
    expect(drill).toContain("actions/workflows/database-backup.yml/runs?branch=$default_branch&status=success");
    expect(drill).toContain('select(.event == "schedule" or .event == "workflow_dispatch")');
    expect(drill).toContain("select(.repository.full_name == $repo and .head_repository.full_name == $repo)");
    expect(drill).toContain('select(.path == ".github/workflows/database-backup.yml")');
    expect(drill).toContain('compare/$candidate_sha...$default_branch');
    expect(drill).toContain('[ "$relation" = "identical" ] || [ "$relation" = "ahead" ]');
    expect(drill).toMatch(/Stop isolated database\r?\n\s+if: always\(\)/);
  });

  it("derives backup paths from the run id and validates them before use", () => {
    expect(drill).toContain('--name "agendfined-db-$run_id"');
    expect(drill).toContain('public_backup="backup/agendfined-$run_id.sql.gz.aes256gcm"');
    expect(drill).toContain('auth_backup="backup/agendfined-auth-$run_id.sql.gz.aes256gcm"');
    expect(drill.split("=~ ^backup/[A-Za-z0-9._/-]+$ ]]").length - 1).toBe(2);
    expect(drill).toContain('[ "$entries" -eq 2 ]');
    expect(drill).toContain(">> \"$GITHUB_OUTPUT\"");
    expect(drill).not.toContain("GITHUB_ENV");
  });

  it("exposes the encryption key only to the restore step", () => {
    const keyLines = drill.split(/\r?\n/).filter((line) => line.includes("secrets.BACKUP_ENCRYPTION_KEY"));
    expect(keyLines).toEqual(["          BACKUP_ENCRYPTION_KEY: ${{ secrets.BACKUP_ENCRYPTION_KEY }}"]);
    const restoreStep = drill.indexOf("- name: Restore public and Auth dumps");
    const nextStep = drill.indexOf("- name: Verify restored data");
    const keyAt = drill.indexOf("secrets.BACKUP_ENCRYPTION_KEY");
    expect(keyAt).toBeGreaterThan(restoreStep);
    expect(keyAt).toBeLessThan(nextStep);
  });
});

describe("backup freshness watchdog workflow", () => {
  const watchdog = readFileSync(".github/workflows/database-backup-watchdog.yml", "utf8");

  it("only counts backup runs from this repository's default branch", () => {
    expect(watchdog).toContain("actions/workflows/database-backup.yml/runs?branch=$default_branch&status=success");
    expect(watchdog).toContain('select(.event == "schedule" or .event == "workflow_dispatch")');
    expect(watchdog).toContain("select(.repository.full_name == $repo and .head_repository.full_name == $repo)");
  });
});

describe("workflow supply chain", () => {
  const workflows = readdirSync(".github/workflows")
    .filter((name) => name.endsWith(".yml"))
    .map((name) => ({ name, text: readFileSync(`.github/workflows/${name}`, "utf8") }));

  it("pins every action to a full commit SHA with the version in a comment", () => {
    for (const { name, text } of workflows) {
      for (const line of text.split(/\r?\n/).filter((l) => /^\s*(-\s+)?uses:/.test(l))) {
        expect(line, name).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
      }
    }
  });

  it("runs the Supabase CLI at a fixed version in the restore drill", () => {
    const calls = drill.match(/npx [^\n]*supabase\S*/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/npx --yes supabase@\d+\.\d+\.\d+$/);
  });
});

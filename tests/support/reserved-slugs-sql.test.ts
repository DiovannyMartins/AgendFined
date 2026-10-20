import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS } from "@/lib/business/reserved-slugs";

// Static guard: public.reject_reserved_business_slug repeats RESERVED_SLUGS in
// SQL, so the database refuses the same slugs as createBusiness and updateBusiness. The latest
// migration that defines the function is the one in force.
function latestSqlSlugs(): string[] {
  const dir = "supabase/migrations";
  const file = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) =>
      readFileSync(`${dir}/${name}`, "utf8").includes("function public.reject_reserved_business_slug()"),
    );
  if (!file) throw new Error("No migration defines public.reject_reserved_business_slug");
  const block = readFileSync(`${dir}/${file}`, "utf8").split("-- slugs:begin")[1]?.split("-- slugs:end")[0] ?? "";
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("reserved slugs in SQL", () => {
  it("matches RESERVED_SLUGS", () => {
    expect([...latestSqlSlugs()].sort()).toEqual([...RESERVED_SLUGS].sort());
  });
});

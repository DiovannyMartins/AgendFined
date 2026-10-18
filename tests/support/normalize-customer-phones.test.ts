import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { customerPhoneSchema } from "@/lib/validation/schemas";

// Static guard: the SQL test pins private.normalize_customer_phone (the
// migration that normalizes stored phones) to these cases, and this test pins
// the same cases to customerPhoneSchema, so the two rules cannot drift apart.
const sqlTest = readFileSync("tests/sql/normalize-customer-phones.sql", "utf8");

function sqlCases(): Array<[string, string | null]> {
  const block = sqlTest.split("-- cases:begin")[1]?.split("-- cases:end")[0] ?? "";
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("("))
    .map((line) => {
      const match = /^\('((?:[^']|'')*)', (?:'((?:[^']|'')*)'|null)\),?$/.exec(line);
      if (!match) throw new Error(`Unparseable SQL case: ${line}`);
      return [match[1].replaceAll("''", "'"), match[2] === undefined ? null : match[2].replaceAll("''", "'")];
    });
}

describe("customer phone normalization in SQL", () => {
  const cases = sqlCases();

  it("covers accepted and rejected phones", () => {
    expect(cases.filter(([, stored]) => stored !== null).length).toBeGreaterThanOrEqual(5);
    expect(cases.filter(([, stored]) => stored === null).length).toBeGreaterThanOrEqual(5);
  });

  it.each(cases)("customerPhoneSchema agrees with the SQL case %j -> %j", (input, stored) => {
    const parsed = customerPhoneSchema.safeParse(input);
    expect(parsed.success ? parsed.data : null).toBe(stored);
  });
});

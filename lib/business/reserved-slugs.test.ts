import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, isReservedSlug } from "./reserved-slugs";

const ROOT = process.cwd();
const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Next.js file conventions that become URLs at the folder they live in
// (e.g. app/robots.ts → /robots.txt, app/icon.tsx → /icon).
const METADATA_FILE = /^(favicon|icon|apple-icon|opengraph-image|twitter-image|manifest|robots|sitemap)\d*\.[a-z]+$/;

// Route groups such as (auth) and (marketing) add no URL segment, so their
// children are first-level routes too. Private (_x), parallel (@x),
// intercepting ((.)x) and dynamic ([x]) folders never claim a static segment.
function firstLevelAppSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (/^\([^.][^)]*\)$/.test(entry.name)) return firstLevelAppSegments(join(dir, entry.name));
      if (/^[_@[(]/.test(entry.name)) return [];
      return [entry.name];
    }
    const metadata = METADATA_FILE.exec(entry.name);
    return metadata ? [metadata[1]] : [];
  });
}

describe("RESERVED_SLUGS", () => {
  it("covers every first-level route in app/, including route groups", () => {
    const segments = firstLevelAppSegments(join(ROOT, "app")).filter((s) => SLUG_FORMAT.test(s));
    expect(segments).toContain("recuperar-senha");
    expect(segments.filter((s) => !RESERVED_SLUGS.includes(s))).toEqual([]);
  });

  it("covers every first-level prefix served from public/", () => {
    const prefixes = readdirSync(join(ROOT, "public")).filter((name) => SLUG_FORMAT.test(name));
    expect(prefixes).toContain("brand");
    expect(prefixes.filter((p) => !RESERVED_SLUGS.includes(p))).toEqual([]);
  });

  it.each(["recuperar-senha", "redefinir-senha", "auth", "mfa", "brand", "images"])(
    "reserves %s",
    (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
    },
  );

  it("normalizes case and whitespace before checking", () => {
    expect(isReservedSlug("  Recuperar-Senha ")).toBe(true);
  });

  it("accepts a regular business slug", () => {
    expect(isReservedSlug("barbearia-do-joao")).toBe(false);
  });
});

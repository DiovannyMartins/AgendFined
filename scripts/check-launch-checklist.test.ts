import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkChecklist } from "./check-launch-checklist.mjs";

const dirs: string[] = [];
function fixture(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "checklist-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return dir;
}
const allItems = (skip: number[] = []) =>
  Array.from({ length: 50 }, (_, i) => i + 1)
    .filter((n) => n !== 49 && !skip.includes(n))
    .map((n) => `- [x] ${n}. Item`)
    .join("\n");

afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("checkChecklist", () => {
  it("accepts the 49 in-scope items", () => {
    expect(checkChecklist(fixture({ "01-a.md": allItems() }))).toEqual([]);
  });

  it("detects missing, duplicated, excluded and invalid items and broken links", () => {
    const errors: string[] = checkChecklist(fixture({
      "01-a.md": allItems([7]) + "\n- [x] 3. Dup\n- [x] 49. I18n\n- [?] 50. Bad\n[link](./nao-existe.md)",
    }));
    expect(errors.join("\n")).toMatch(/item 7 ausente/);
    expect(errors.join("\n")).toMatch(/item 3 duplicado/);
    expect(errors.join("\n")).toMatch(/item 49 está fora do escopo/);
    expect(errors.join("\n")).toMatch(/status inválido "\[\?\]" no item 50/);
    expect(errors.join("\n")).toMatch(/link para arquivo inexistente/);
  });
});

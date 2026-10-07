#!/usr/bin/env node
// Consistency check for docs/checklist-lancamento.
// - items 1..50 (except EXCLUDED_ITEMS, removed by the owner) appear exactly once;
// - excluded items do not appear;
// - only [x], [~], [!] and [ ] are used;
// - relative Markdown links point to existing files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Out of scope by decision of the launch owner (6 Oct 2026):
// 19 e-mail signup form, 29 third-party feedback, 38 contact list,
// 42 usability test, 49 multilingual site.
export const EXCLUDED_ITEMS = [19, 29, 38, 42, 49];
const ITEM_LINE = /^\s*-\s*\[(.)\]\s*(\d+)\.\s/;
const ANY_CHECKBOX = /^\s*-\s*\[([^\]]*)\]\s*(\d+)\./;
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const VALID_STATUS = new Set(["x", "~", "!", " "]);

export function checkChecklist(dir) {
  const errors = [];
  const seen = new Map();
  const files = readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
  const phaseFiles = files.filter((name) => /^\d{2}-.*\.md$/.test(name));

  for (const name of files) {
    const text = readFileSync(path.join(dir, name), "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (phaseFiles.includes(name)) {
        const loose = line.match(ANY_CHECKBOX);
        if (loose) {
          const strict = line.match(ITEM_LINE);
          if (!strict || !VALID_STATUS.has(strict[1])) {
            errors.push(`${name}:${index + 1}: status inválido "[${loose[1]}]" no item ${loose[2]}`);
          } else {
            const item = Number(strict[2]);
            const where = `${name}:${index + 1}`;
            seen.set(item, [...(seen.get(item) ?? []), where]);
          }
        }
      }
      for (const match of line.matchAll(LINK)) {
        const target = match[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const file = decodeURIComponent(target.split("#")[0]);
        if (file && !existsSync(path.resolve(dir, file))) {
          errors.push(`${name}:${index + 1}: link para arquivo inexistente "${target}"`);
        }
      }
    });
  }

  for (let item = 1; item <= 50; item++) {
    const places = seen.get(item) ?? [];
    if (EXCLUDED_ITEMS.includes(item)) {
      if (places.length) errors.push(`item ${item} está fora do escopo e não deve aparecer (${places.join(", ")})`);
      continue;
    }
    if (places.length === 0) errors.push(`item ${item} ausente`);
    if (places.length > 1) errors.push(`item ${item} duplicado (${places.join(", ")})`);
  }
  for (const item of seen.keys()) {
    if (item < 1 || item > 50) errors.push(`item ${item} fora da faixa 1–50`);
  }
  return errors;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dir = process.argv[2] ?? path.join(process.cwd(), "docs", "checklist-lancamento");
  const errors = checkChecklist(dir);
  if (errors.length) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exit(1);
  }
  console.log(`✓ checklist consistente: ${50 - EXCLUDED_ITEMS.length} itens em escopo, excluídos ${EXCLUDED_ITEMS.join(", ")}, status e links válidos.`);
}

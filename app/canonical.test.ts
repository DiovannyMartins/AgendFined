import type { Metadata } from "next";
import { beforeAll, describe, expect, it, vi } from "vitest";

// O layout raiz não roda as fontes do Next fora do build.
vi.mock("next/font/google", () => ({
  Instrument_Sans: () => ({ variable: "font-sans" }),
  Instrument_Serif: () => ({ variable: "font-display" }),
}));

// Um canônico herdado do layout raiz faz cada página dizer ao Google que é a
// home: /privacidade e /termos saíam do índice. Cada página indexável declara
// o próprio endereço; as páginas noindex ficam sem canônico.
const INDEXABLE: [string, () => Promise<{ metadata?: Metadata }>, string][] = [
  ["/", () => import("./(marketing)/page"), "/"],
  ["/privacidade", () => import("./privacidade/page"), "/privacidade"],
  ["/termos", () => import("./termos/page"), "/termos"],
];

const IMPORT_TIMEOUT_MS = 60_000;

describe("canônico das páginas", () => {
  const loaded = new Map<string, { metadata?: Metadata }>();
  let rootMetadata: Metadata | undefined;

  beforeAll(async () => {
    rootMetadata = (await import("./layout")).metadata;
    for (const [route, load] of INDEXABLE) {
      loaded.set(route, await load());
    }
  }, IMPORT_TIMEOUT_MS);

  it("o layout raiz não impõe um canônico a todas as páginas", () => {
    expect(rootMetadata?.alternates?.canonical).toBeUndefined();
  });

  it.each(INDEXABLE)("%s declara o próprio endereço", (route, _load, canonical) => {
    expect(loaded.get(route)?.metadata?.alternates?.canonical).toBe(canonical);
  });
});

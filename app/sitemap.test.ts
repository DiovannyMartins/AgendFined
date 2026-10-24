import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  filters: [] as Array<[string, unknown]>,
  rows: [] as Array<{ slug: string; updated_at: string }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          state.filters.push([column, value]);
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => resolve({ data: state.rows, error: null }),
      };
      return query;
    },
  }),
}));

import sitemap from "./sitemap";

describe("sitemap", () => {
  beforeEach(() => {
    state.filters = [];
    state.rows = [];
  });

  // Um negócio de teste em produção fica ativo para o smoke test pós-deploy,
  // mas não pode aparecer para buscadores.
  it("lista só negócios ativos e liberados para buscadores", async () => {
    await sitemap();

    expect(state.filters).toEqual([
      ["is_active", true],
      ["search_indexing_enabled", true],
    ]);
  });

  it("publica a página de cada negócio listado", async () => {
    state.rows = [{ slug: "barbearia", updated_at: "2026-10-24T00:00:00Z" }];

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain("https://agendfined.com.br/barbearia");
  });
});

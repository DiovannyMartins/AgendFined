import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database-types";
import { getBookingReadiness, hasActiveAvailability } from "./readiness";

type Result = { count: number | null; error: { message: string } | null };

function fakeClient(results: Record<string, Result>) {
  const filters: Record<string, Array<[string, unknown]>> = {};
  const client = {
    from: (table: string) => {
      filters[table] = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[table].push([column, value]);
          return query;
        },
        then: (resolve: (value: Result) => unknown) => resolve(results[table] ?? { count: 0, error: null }),
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, filters };
}

describe("prontidão do negócio para reservas", () => {
  it("só conta serviços e faixas ativos do próprio negócio", async () => {
    const { client, filters } = fakeClient({});

    await getBookingReadiness(client, "biz-1");

    expect(filters.services).toEqual([["business_id", "biz-1"], ["is_active", true]]);
    expect(filters.availability).toEqual([["business_id", "biz-1"], ["is_active", true]]);
  });

  it("aponta o que falta em um negócio novo", async () => {
    const { client } = fakeClient({});

    expect(await getBookingReadiness(client, "biz-1")).toEqual({ hasActiveService: false, hasAvailability: false });
  });

  it("fica pronto com um serviço ativo e uma faixa ativa", async () => {
    const { client } = fakeClient({
      services: { count: 2, error: null },
      availability: { count: 1, error: null },
    });

    expect(await getBookingReadiness(client, "biz-1")).toEqual({ hasActiveService: true, hasAvailability: true });
  });

  it("trata uma consulta com falha como configurada", async () => {
    const { client } = fakeClient({ availability: { count: null, error: { message: "boom" } } });

    expect(await hasActiveAvailability(client, "biz-1")).toBe(true);
  });
});

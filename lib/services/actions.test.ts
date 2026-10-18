import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { inserts: [] as Record<string, unknown>[] },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: async () => ({ id: "business-1" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

import { createService } from "./actions";

function serviceForm(price: string, durationMinutes = "30") {
  const fd = new FormData();
  fd.set("name", "Corte");
  fd.set("description", "");
  fd.set("durationMinutes", durationMinutes);
  fd.set("price", price);
  return fd;
}

describe("createService price", () => {
  beforeEach(() => {
    state.inserts = [];
  });

  it.each(["49,90", "49.90"])("stores %s as 4990 centavos", async (price) => {
    const result = await createService({ ok: true, data: undefined }, serviceForm(price));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.inserts).toEqual([expect.objectContaining({ price_cents: 4990 })]);
  });

  it("rejects an invalid price with a pt-BR field error", async () => {
    const result = await createService({ ok: true, data: undefined }, serviceForm("49,901"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { priceCents: ["Informe um preço válido."] } });
    expect(state.inserts).toEqual([]);
  });

  it("explains an out-of-range duration in pt-BR", async () => {
    const result = await createService({ ok: true, data: undefined }, serviceForm("49,90", "0"));

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { durationMinutes: ["Informe uma duração entre 5 e 480 minutos."] },
    });
  });
});
